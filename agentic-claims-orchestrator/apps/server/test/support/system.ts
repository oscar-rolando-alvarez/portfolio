import type { ClaimState, LlmPort, Principal, RunStore, VaultStorage } from '@aco/core';
import { loadConfig, type AppConfig } from '../../src/config.ts';
import { createContainer, type Container } from '../../src/container.ts';
import { loadGoldenSet } from '../../src/evals/harness.ts';
import { hashApiKey } from '../../src/http/auth.ts';

export const KEYS = {
  intake: 'test-intake-key-0001',
  adjuster: 'test-adjuster-key-0001',
  senior: 'test-senior-key-0001',
  siu: 'test-siu-key-0001',
  auditor: 'test-auditor-key-0001',
  operator: 'test-operator-key-0001',
  otherTenant: 'test-other-tenant-0001',
} as const;

export const PRINCIPALS: Record<string, Principal> = {
  intake: { id: 'intake-bot', tenantId: 'acme', roles: ['claims_intake'] },
  adjuster: { id: 'ann.adjuster', tenantId: 'acme', roles: ['adjuster'] },
  senior: { id: 'sam.senior', tenantId: 'acme', roles: ['senior_adjuster', 'adjuster'] },
  siu: { id: 'sia.siu', tenantId: 'acme', roles: ['siu_investigator'] },
  auditor: { id: 'aud.it', tenantId: 'acme', roles: ['auditor'] },
  operator: { id: 'ops', tenantId: 'acme', roles: ['operator'] },
  otherTenant: { id: 'globex-bot', tenantId: 'globex', roles: ['claims_intake', 'adjuster', 'auditor'] },
};

export function testConfig(env: Record<string, string> = {}): AppConfig {
  const apiKeys = Object.entries(KEYS).map(([name, key]) => {
    const p = PRINCIPALS[name];
    if (!p) throw new Error(name);
    return { id: p.id, tenantId: p.tenantId, roles: p.roles, sha256: hashApiKey(key) };
  });
  return loadConfig({
    NODE_ENV: 'test',
    STORAGE: 'memory',
    LOG_LEVEL: 'silent',
    API_KEYS: JSON.stringify(apiKeys),
    STEP_MAX_ATTEMPTS: '2',
    ...env,
  });
}

export async function offlineSystem(
  opts: {
    llm?: LlmPort;
    env?: Record<string, string>;
    store?: RunStore<ClaimState>;
    vaultStorage?: VaultStorage;
  } = {},
): Promise<Container> {
  return createContainer(testConfig(opts.env), {
    sleep: () => Promise.resolve(),
    ...(opts.llm ? { llm: opts.llm } : {}),
    ...(opts.store && opts.vaultStorage ? { store: opts.store, vaultStorage: opts.vaultStorage } : {}),
  });
}

export function scenario(id: string) {
  const sc = loadGoldenSet().scenarios.find((s) => s.id === id);
  if (!sc) throw new Error(`scenario ${id} not found`);
  return structuredClone(sc);
}
