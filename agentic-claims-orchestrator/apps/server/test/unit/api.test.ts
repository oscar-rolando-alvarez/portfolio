import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Container } from '../../src/container.ts';
import { createApp } from '../../src/http/app.ts';
import { KEYS, offlineSystem, scenario } from '../support/system.ts';

let container: Container;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  container = await offlineSystem();
  app = createApp(container);
});
afterAll(async () => {
  await container.close();
});

const json = (key: string, body?: unknown, headers: Record<string, string> = {}) => ({
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

async function submit(id: string, key = `idem-${id}-${Math.random().toString(36).slice(2)}`) {
  const res = await app.request(
    '/v1/claims?wait=true',
    json(KEYS.intake, scenario(id).fnol, { 'idempotency-key': key }),
  );
  return { res, body: (await res.json()) as Record<string, unknown>, key };
}

describe('HTTP API', () => {
  it('exposes liveness and readiness', async () => {
    expect((await app.request('/healthz')).status).toBe(200);
    const ready = await app.request('/readyz');
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      ok: true,
      checks: {
        store: true,
        'tool:policy_lookup': true,
        'tool:claims_history': true,
        'tool:document_extract': true,
      },
    });
  });

  it('rejects unauthenticated requests with problem+json', async () => {
    const res = await app.request('/v1/claims/x');
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect((await app.request('/v1/claims/x', json('wrong-key-wrong-key'))).status).toBe(401);
  });

  it('requires an Idempotency-Key and validates the FNOL payload', async () => {
    expect((await app.request('/v1/claims', json(KEYS.intake, scenario('S02').fnol))).status).toBe(400);
    const res = await app.request(
      '/v1/claims',
      json(KEYS.intake, { policyNumber: 'nope' }, { 'idempotency-key': 'idem-invalid-1' }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { details: { issues: unknown[] } };
    expect(body.details.issues.length).toBeGreaterThan(0);
  });

  it('enforces RBAC on submission', async () => {
    const res = await app.request(
      '/v1/claims',
      json(KEYS.adjuster, scenario('S02').fnol, { 'idempotency-key': 'idem-rbac-0001' }),
    );
    expect(res.status).toBe(403);
  });

  it('processes a straight-through claim end-to-end and never returns raw PII', async () => {
    const { res, body } = await submit('S02');
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ status: 'completed', final: { outcome: 'approve', payoutAmount: 3350 } });
    const text = JSON.stringify(body);
    const raw = scenario('S02').fnol.claimant;
    expect(text).not.toContain(raw.email);
    expect(text).not.toContain(raw.fullName);
    expect(text).toContain('[[pii:email:');
  });

  it('replays idempotent submissions and rejects key reuse with a different payload', async () => {
    const first = await submit('S24', 'idem-replay-0001');
    const again = await app.request(
      '/v1/claims',
      json(KEYS.intake, scenario('S24').fnol, { 'idempotency-key': 'idem-replay-0001' }),
    );
    expect(again.status).toBe(200);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(((await again.json()) as { claimId: string }).claimId).toBe(first.body.claimId);

    const changed = { ...scenario('S24').fnol, claimedAmount: 999 };
    const conflict = await app.request(
      '/v1/claims',
      json(KEYS.intake, changed, { 'idempotency-key': 'idem-replay-0001' }),
    );
    expect(conflict.status).toBe(409);
  });

  it('pauses high payouts for a senior adjuster and resumes on approval (with RBAC + four-eyes)', async () => {
    const { body } = await submit('S06');
    expect(body).toMatchObject({
      status: 'awaiting_approval',
      routing: { routing: 'senior_adjuster_review' },
    });
    const claimId = body.claimId as string;
    const approvalId = (body.pendingApproval as { approvalId: string }).approvalId;

    const queue = await app.request('/v1/approvals', json(KEYS.senior));
    expect(
      ((await queue.json()) as { items: { approvalId: string }[] }).items.map((i) => i.approvalId),
    ).toContain(approvalId);
    const adjQueue = (await (await app.request('/v1/approvals', json(KEYS.adjuster))).json()) as {
      items: { approvalId: string }[];
    };
    expect(adjQueue.items.map((i) => i.approvalId)).not.toContain(approvalId);

    const url = `/v1/claims/${claimId}/approvals/${approvalId}`;
    expect((await app.request(url, json(KEYS.adjuster, { decision: 'approve' }))).status).toBe(403);
    expect((await app.request(url, json(KEYS.senior, { decision: 'nope' }))).status).toBe(422);
    const tooMuch = await app.request(
      url,
      json(KEYS.senior, {
        decision: 'override',
        outcome: 'approve',
        payoutAmount: 999_999,
        comment: 'goodwill payment',
      }),
    );
    expect(tooMuch.status).toBe(422);

    const ok = await app.request(
      url,
      json(KEYS.senior, { decision: 'approve', comment: 'estimate verified' }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      status: 'completed',
      final: {
        outcome: 'approve',
        payoutAmount: 14000,
        decidedBy: 'human',
        routing: 'senior_adjuster_review',
      },
      review: { decidedBy: 'sam.senior' },
    });
  });

  it('supports reviewer overrides with justification', async () => {
    const { body } = await submit('S16');
    const approvalId = (body.pendingApproval as { approvalId: string }).approvalId;
    const res = await app.request(
      `/v1/claims/${body.claimId as string}/approvals/${approvalId}`,
      json(KEYS.adjuster, {
        decision: 'override',
        outcome: 'deny',
        comment: 'estimate appears altered; deny',
      }),
    );
    expect(await res.json()).toMatchObject({
      final: { outcome: 'deny', payoutAmount: 0, decidedBy: 'human' },
    });
  });

  it('serves a verifiable audit trail to auditors only, scoped by tenant', async () => {
    const { body } = await submit('S04');
    const id = body.claimId as string;
    const audit = await app.request(`/v1/claims/${id}/audit`, json(KEYS.auditor));
    expect(audit.status).toBe(200);
    const trail = (await audit.json()) as { verification: { valid: boolean }; events: { type: string }[] };
    expect(trail.verification.valid).toBe(true);
    expect(trail.events.map((e) => e.type)).toContain('claim.finalized');
    expect((await app.request(`/v1/claims/${id}/audit`, json(KEYS.intake))).status).toBe(403);
    expect((await app.request(`/v1/claims/${id}`, json(KEYS.otherTenant))).status).toBe(404);
  });

  it('only operators may resume runs', async () => {
    const { body } = await submit('S02');
    const res = await app.request(`/v1/claims/${body.claimId as string}/resume`, json(KEYS.adjuster, {}));
    expect(res.status).toBe(403);
    const asOps = await app.request(`/v1/claims/${body.claimId as string}/resume`, json(KEYS.operator, {}));
    expect(asOps.status).toBe(409);
  });

  it('describes the graph and policy version', async () => {
    const res = await app.request('/v1/graph', json(KEYS.auditor));
    expect(await res.json()).toMatchObject({ graphId: 'claims-triage', policyVersion: '2026.10.1' });
  });

  it('returns 404 problem for unknown routes', async () => {
    expect((await app.request('/nope')).status).toBe(404);
  });
});
