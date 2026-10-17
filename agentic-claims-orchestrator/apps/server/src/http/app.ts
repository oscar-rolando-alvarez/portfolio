import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { DomainError, type ErrorCode, type Principal } from '@aco/core';
import type { Container } from '../container.ts';
import { ApiKeyAuthenticator } from './auth.ts';

interface Env {
  Variables: { principal: Principal; requestId: string };
}

const STATUS: Record<ErrorCode, 400 | 403 | 404 | 409 | 422 | 500 | 503> = {
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CONCURRENCY: 409,
  FORBIDDEN: 403,
  TRANSIENT: 503,
  TIMEOUT: 503,
  BUDGET_EXCEEDED: 422,
  POLICY_BLOCKED: 409,
  TOOL_FAILED: 500,
  LLM_FAILED: 500,
  STEP_FAILED: 500,
};

/** RFC 9457 problem details. */
function problem(
  path: string,
  status: number,
  title: string,
  detail?: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title, status, detail, instance: path, ...extra }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  );
}

export function createApp(container: Container): Hono<Env> {
  const auth = new ApiKeyAuthenticator(container.config.apiKeys);
  const { service, logger } = container;
  const app = new Hono<Env>();

  app.use('*', requestId());
  app.use('*', secureHeaders());
  app.use(
    '*',
    bodyLimit({ maxSize: 256 * 1024, onError: (c) => problem(c.req.path, 413, 'Payload too large') }),
  );
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
        requestId: c.get('requestId'),
      },
      'http request',
    );
  });

  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return problem(
        c.req.path,
        STATUS[err.code],
        err.code,
        err.message,
        err.details ? { details: err.details } : {},
      );
    }
    logger.error({ err: err.message, requestId: c.get('requestId') }, 'unhandled error');
    return problem(c.req.path, 500, 'INTERNAL', 'unexpected error');
  });

  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    const r = await container.readiness();
    return c.json(r, r.ok ? 200 : 503);
  });

  const v1 = new Hono<Env>();
  v1.use('*', async (c, next) => {
    const principal = auth.authenticate({
      apiKey: c.req.header('x-api-key'),
      authorization: c.req.header('authorization'),
    });
    if (!principal) return problem(c.req.path, 401, 'UNAUTHORIZED', 'missing or invalid API key');
    c.set('principal', principal);
    await next();
    return undefined;
  });

  v1.get('/graph', (c) =>
    c.json({
      graphId: container.orchestrator.graph.id,
      graphVersion: container.orchestrator.graph.version,
      policyVersion: container.policy.policyVersion,
      mermaid: container.orchestrator.graph.toMermaid({ coverage: ['fraudRisk', 'decision'] }),
    }),
  );

  v1.post('/claims', async (c) => {
    const key = c.req.header('idempotency-key');
    if (!key)
      return problem(c.req.path, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    const body: unknown = await c.req.json().catch(() => null);
    if (body === null) return problem(c.req.path, 400, 'INVALID_JSON', 'request body must be JSON');
    const wait = c.req.query('wait') === 'true';
    const { claim, created } = await service.submit(c.get('principal'), body, key, { wait });
    c.header('location', `/v1/claims/${claim.claimId}`);
    if (!created) c.header('idempotent-replayed', 'true');
    return c.json(claim, created ? (wait ? 201 : 202) : 200);
  });

  v1.get('/claims/:id', async (c) => c.json(await service.get(c.get('principal'), c.req.param('id'))));

  v1.get('/claims/:id/audit', async (c) =>
    c.json(await service.audit(c.get('principal'), c.req.param('id'))),
  );

  v1.get('/approvals', async (c) => c.json({ items: await service.pendingApprovals(c.get('principal')) }));

  v1.post('/claims/:id/approvals/:approvalId', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (body === null) return problem(c.req.path, 400, 'INVALID_JSON', 'request body must be JSON');
    const claim = await service.decide(
      c.get('principal'),
      c.req.param('id'),
      c.req.param('approvalId'),
      body,
    );
    return c.json(claim);
  });

  v1.post('/claims/:id/resume', async (c) =>
    c.json(await service.resume(c.get('principal'), c.req.param('id'))),
  );

  app.route('/v1', v1);
  app.notFound((c) => problem(c.req.path, 404, 'NOT_FOUND', 'route not found'));
  return app;
}
