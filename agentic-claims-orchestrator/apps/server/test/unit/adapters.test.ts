import { describe, expect, it } from 'vitest';
import { DomainError, TransientError } from '@aco/core';
import { OpenAiCompatibleLlm } from '@aco/infra';
import { loadConfig } from '../../src/config.ts';
import { DEFAULT_THRESHOLDS, runEvals } from '../../src/evals/harness.ts';
import { ApiKeyAuthenticator, hashApiKey } from '../../src/http/auth.ts';
import { testConfig } from '../support/system.ts';

function fakeFetch(
  status: number,
  body: unknown,
  seen: { url?: string; init?: RequestInit } = {},
): typeof fetch {
  return ((url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
}

describe('OpenAiCompatibleLlm', () => {
  const ok = {
    model: 'gpt-x-2026',
    choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 3 },
  };

  it('sends an OpenAI-compatible chat completion request', async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const llm = new OpenAiCompatibleLlm({
      baseUrl: 'http://llm.local/v1/',
      apiKey: 'sk-test',
      model: 'm',
      fetchImpl: fakeFetch(200, ok, seen),
    });
    const res = await llm.complete({ task: 't', system: 's', user: 'u', json: true, maxOutputTokens: 50 });
    expect(seen.url).toBe('http://llm.local/v1/chat/completions');
    const body = JSON.parse(seen.init?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'm', max_tokens: 50, response_format: { type: 'json_object' } });
    expect((seen.init?.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(res).toEqual({
      text: '{"a":1}',
      model: 'gpt-x-2026',
      finishReason: 'stop',
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it('supports api-key style auth headers (e.g. Azure OpenAI)', async () => {
    const seen: { init?: RequestInit } = {};
    const llm = new OpenAiCompatibleLlm({
      baseUrl: 'http://x',
      apiKey: 'k',
      authHeader: 'api-key',
      model: 'm',
      fetchImpl: fakeFetch(200, ok, seen),
    });
    await llm.complete({ task: 't', system: 's', user: 'u' });
    expect((seen.init?.headers as Record<string, string>)['api-key']).toBe('k');
  });

  it('classifies 429/5xx as transient and 4xx as permanent', async () => {
    const mk = (status: number) =>
      new OpenAiCompatibleLlm({ baseUrl: 'http://x', model: 'm', fetchImpl: fakeFetch(status, {}) });
    await expect(mk(429).complete({ task: 't', system: 's', user: 'u' })).rejects.toBeInstanceOf(
      TransientError,
    );
    await expect(mk(503).complete({ task: 't', system: 's', user: 'u' })).rejects.toBeInstanceOf(
      TransientError,
    );
    await expect(mk(400).complete({ task: 't', system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'LLM_FAILED',
    });
    await expect(mk(200).complete({ task: 't', system: 's', user: 'u' })).rejects.toBeInstanceOf(DomainError);
  });

  it('treats network errors as transient', async () => {
    const llm = new OpenAiCompatibleLlm({
      baseUrl: 'http://x',
      model: 'm',
      fetchImpl: () => Promise.reject(new Error('ECONNRESET')),
    });
    await expect(llm.complete({ task: 't', system: 's', user: 'u' })).rejects.toBeInstanceOf(TransientError);
  });
});

describe('configuration', () => {
  it('validates cross-field requirements', () => {
    expect(() => loadConfig({ STORAGE: 'postgres' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ STORAGE: 'memory', LLM_PROVIDER: 'openai_compatible' })).toThrow(
      /LLM_BASE_URL/,
    );
    expect(() => loadConfig({ STORAGE: 'memory', NODE_ENV: 'production' })).toThrow(/PII keys/);
    expect(() => loadConfig({ STORAGE: 'memory', MCP_TRANSPORT: 'stdio' })).toThrow(/stdio/);
  });

  it('uses ephemeral keys outside production when none are configured', () => {
    const c = loadConfig({ STORAGE: 'memory' });
    expect(c.ephemeralKeys).toBe(true);
    expect(Buffer.from(c.piiEncryptionKey, 'base64')).toHaveLength(32);
  });
});

describe('API key authentication', () => {
  const auth = new ApiKeyAuthenticator([
    { id: 'svc', tenantId: 'acme', roles: ['claims_intake'], sha256: hashApiKey('a-very-long-api-key') },
  ]);
  it('accepts x-api-key or bearer tokens and rejects unknown keys', () => {
    expect(auth.authenticate({ apiKey: 'a-very-long-api-key' })).toMatchObject({
      id: 'svc',
      tenantId: 'acme',
    });
    expect(auth.authenticate({ authorization: 'Bearer a-very-long-api-key' })?.id).toBe('svc');
    expect(auth.authenticate({ apiKey: 'another-long-api-key' })).toBeNull();
    expect(auth.authenticate({ apiKey: 'short' })).toBeNull();
    expect(auth.authenticate({})).toBeNull();
  });
});

describe('eval harness', () => {
  it('passes the golden set with zero policy violations using the deterministic fake LLM', async () => {
    const report = await runEvals({ config: testConfig() });
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.metrics.policyViolations).toBe(0);
    expect(report.metrics.routingAccuracy).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.routingAccuracy);
    expect(report.scenarios).toBeGreaterThanOrEqual(20);
  });
});
