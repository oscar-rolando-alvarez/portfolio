import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ConcurrencyError,
  Orchestrator,
  verifyAuditChain,
  type ClaimState,
  type RunStore,
  type StepCommit,
} from '@aco/core';
import { PgRunStore, createDatabase, runMigrations, type Database } from '@aco/infra';
import { createContainer, type Container } from '../../src/container.ts';
import { PRINCIPALS, scenario, testConfig } from '../support/system.ts';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('integration tests require DATABASE_URL (see README "Tests")');

let db: Database;
let pool: pg.Pool;
let store: PgRunStore<{ n: number }>;
const env = { STORAGE: 'postgres', DATABASE_URL, RUN_MIGRATIONS: 'true' };
const intake = PRINCIPALS.intake ?? { id: 'x', tenantId: 'acme', roles: [] };
const senior = PRINCIPALS.senior ?? { id: 'y', tenantId: 'acme', roles: [] };

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  );
  await admin.end();
  ({ db, pool } = createDatabase(DATABASE_URL));
  await runMigrations(db);
  store = new PgRunStore<{ n: number }>(db);
});

afterAll(async () => {
  await pool.end();
});

const newRun = (key: string = randomUUID()) => ({
  runId: randomUUID(),
  tenantId: 'acme',
  idempotencyKey: key,
  graphId: 'g',
  graphVersion: '1',
  currentStep: 'a',
  state: { n: 0 },
});

describe('PgRunStore', () => {
  it('creates runs idempotently per tenant + key', async () => {
    const run = newRun('idem-pg-1');
    const a = await store.createRun(run, [{ type: 'run.created', actor: 'user:t', payload: {} }]);
    const b = await store.createRun({ ...run, runId: randomUUID() }, []);
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ created: false, run: { runId: run.runId } });
    const [c, d] = await Promise.all([
      store.createRun(newRun('race-key'), []),
      store.createRun(newRun('race-key'), []),
    ]);
    expect([c.created, d.created].sort()).toEqual([false, true]);
    expect(c.run.runId).toBe(d.run.runId);
  });

  it('commits atomically with optimistic concurrency and keeps a valid hash chain through jsonb', async () => {
    const { run } = await store.createRun(newRun(), [
      { type: 'run.created', actor: 'user:t', payload: { z: 1, a: { y: [1, 2], b: 'x' } } },
    ]);
    const commit: StepCommit<{ n: number }> = {
      runId: run.runId,
      expectedVersion: 1,
      status: 'running',
      currentStep: 'b',
      state: { n: 1 },
      usage: run.usage,
      lastError: null,
      checkpointStep: 'a',
      events: [
        { type: 'step.completed', actor: 'system:orchestrator', payload: { step: 'a', amount: 1234.5 } },
      ],
    };
    const saved = await store.commitStep(commit);
    expect(saved).toMatchObject({ version: 2, currentStep: 'b', state: { n: 1 } });
    await expect(store.commitStep(commit)).rejects.toBeInstanceOf(ConcurrencyError);
    const events = await store.listEvents(run.runId);
    expect(events).toHaveLength(2);
    expect(verifyAuditChain(events).valid).toBe(true);
    expect((await store.listCheckpoints(run.runId)).map((c) => c.step)).toEqual(['__start__', 'a']);
  });

  it('makes the audit trail append-only at the database level', async () => {
    const { run } = await store.createRun(newRun(), [{ type: 'run.created', actor: 'user:t', payload: {} }]);
    await expect(
      pool.query("UPDATE audit_events SET type = 'x' WHERE run_id = $1", [run.runId]),
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM audit_events WHERE run_id = $1', [run.runId])).rejects.toThrow(
      /append-only/,
    );
  });

  it('grants leases exclusively and lets expired leases be stolen', async () => {
    const { run } = await store.createRun(newRun(), []);
    expect(await store.acquireLease(run.runId, 'w1', 300)).toBe(true);
    expect(await store.acquireLease(run.runId, 'w2', 300)).toBe(false);
    expect(await store.acquireLease(run.runId, 'w1', 300)).toBe(true);
    expect(await store.listRecoverable(100)).not.toContain(run.runId);
    await new Promise((r) => setTimeout(r, 400));
    expect(await store.listRecoverable(100)).toContain(run.runId);
    expect(await store.acquireLease(run.runId, 'w2', 300)).toBe(true);
    await store.releaseLease(run.runId, 'w2');
  });
});

describe('claims orchestration on PostgreSQL', () => {
  let container: Container;

  beforeAll(async () => {
    container = await createContainer(testConfig(env), { sleep: () => Promise.resolve() });
  });
  afterAll(async () => {
    await container.close();
  });

  it('runs a claim end-to-end with a durable human-approval pause', async () => {
    const { claim } = await container.service.submit(intake, scenario('S05').fnol, 'pg-e2e-0001', {
      wait: true,
    });
    expect(claim).toMatchObject({
      status: 'awaiting_approval',
      routing: { routing: 'senior_adjuster_review' },
    });

    // a different process (new container, same DB) picks up the approval
    const other = await createContainer(testConfig({ ...env, RUN_MIGRATIONS: 'false' }), {
      sleep: () => Promise.resolve(),
    });
    const approvalId = claim.pendingApproval?.approvalId ?? '';
    const done = await other.service.decide(senior, claim.claimId, approvalId, { decision: 'approve' });
    await other.close();
    expect(done).toMatchObject({ status: 'completed', final: { outcome: 'approve', payoutAmount: 43_000 } });

    const { events, verification } = await container.service.audit(senior, claim.claimId);
    expect(verification.valid).toBe(true);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['approval.requested', 'approval.decided']),
    );
    const cps = await container.store.listCheckpoints(claim.claimId);
    expect(cps.map((c) => c.step)).toEqual([
      '__start__',
      'intake',
      'extraction',
      'coverage',
      'fraudRisk',
      'decision',
      'human_review',
      'finalize',
    ]);
  });

  it('stores PII only as AES-GCM ciphertext in the vault', async () => {
    const raw = scenario('S02').fnol.claimant;
    await container.service.submit(intake, scenario('S02').fnol, 'pg-pii-0001', { wait: true });
    const vault = await pool.query<{ ciphertext: string }>('SELECT ciphertext FROM pii_vault');
    expect(vault.rowCount).toBeGreaterThan(0);
    const dump = JSON.stringify(vault.rows);
    expect(dump).not.toContain(raw.email);
    const everything = await pool.query(
      'SELECT (SELECT json_agg(state) FROM runs)::text AS runs, (SELECT json_agg(payload) FROM audit_events)::text AS audit, (SELECT json_agg(state) FROM checkpoints)::text AS cps',
    );
    const text = JSON.stringify(everything.rows);
    expect(text).not.toContain(raw.email);
    expect(text).not.toContain(raw.fullName);
  });

  it('recovers a run after a worker crash, resuming from the last checkpoint', async () => {
    const pgStore = container.store;
    let crashed = false;
    const crashing: RunStore<ClaimState> = Object.assign(Object.create(pgStore) as RunStore<ClaimState>, {
      commitStep: (c: StepCommit<ClaimState>) => {
        if (!crashed && c.checkpointStep === 'coverage') {
          crashed = true;
          return Promise.reject(new Error('SIGKILL'));
        }
        return pgStore.commitStep(c);
      },
    });
    const mk = (store: RunStore<ClaimState>, id: string) =>
      new Orchestrator<ClaimState>({
        graph: container.orchestrator.graph,
        store,
        gate: container.policy,
        llm: container.llm,
        tools: container.tools.gateway,
        pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
        instanceId: id,
        leaseTtlMs: 300,
        sleep: () => Promise.resolve(),
      });
    const worker1 = mk(crashing, 'worker-1');
    const input = await container.service.tokenize('acme', scenario('S03').fnol);
    const { run } = await worker1.start({
      tenantId: 'acme',
      idempotencyKey: 'pg-crash-0001',
      actor: 'user:t',
      initialState: (id) => ({ claimId: id, tenantId: 'acme', input }),
    });
    await expect(worker1.drive(run.runId)).rejects.toThrow('SIGKILL');
    expect((await pgStore.getRun(run.runId))?.currentStep).toBe('coverage');

    await new Promise((r) => setTimeout(r, 400)); // lease of the dead worker expires
    const worker2 = mk(pgStore, 'worker-2');
    expect(await worker2.recover()).toContain(run.runId);
    const done = await pgStore.getRun(run.runId);
    expect(done?.status).toBe('completed');
    const steps = (await pgStore.listCheckpoints(run.runId)).map((c) => c.step);
    expect(steps.filter((s) => s === 'extraction')).toHaveLength(1);
    expect(steps.filter((s) => s === 'coverage')).toHaveLength(1);
  });

  it('never executes a step twice when two workers race on the same run', async () => {
    const input = await container.service.tokenize('acme', scenario('S24').fnol);
    const mk = (id: string) =>
      new Orchestrator<ClaimState>({
        graph: container.orchestrator.graph,
        store: container.store,
        gate: container.policy,
        llm: container.llm,
        tools: container.tools.gateway,
        pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
        instanceId: id,
        sleep: () => Promise.resolve(),
      });
    const a = mk('race-a');
    const { run } = await a.start({
      tenantId: 'acme',
      idempotencyKey: 'pg-race-0001',
      actor: 'user:t',
      initialState: (id) => ({ claimId: id, tenantId: 'acme', input }),
    });
    await Promise.all([a.drive(run.runId), mk('race-b').drive(run.runId), mk('race-c').drive(run.runId)]);
    await a.drive(run.runId);
    const steps = (await container.store.listCheckpoints(run.runId)).map((c) => c.step);
    expect(new Set(steps).size).toBe(steps.length);
    expect((await container.store.getRun(run.runId))?.status).toBe('completed');
  });

  it('reports readiness against the live database', async () => {
    expect(await container.readiness()).toMatchObject({ ok: true, checks: { store: true } });
  });
});
