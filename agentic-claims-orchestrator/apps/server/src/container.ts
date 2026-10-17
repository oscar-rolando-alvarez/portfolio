import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ClaimsService,
  FakeLlm,
  InMemoryRunStore,
  InMemoryVaultStorage,
  Orchestrator,
  PiiCipher,
  PolicyEngine,
  TokenizingVault,
  createClaimsGraph,
  silentLogger,
  type ClaimState,
  type Clock,
  type LlmPort,
  type Logger,
  type PiiVault,
  type RunBudget,
  type RunStore,
  type Sleep,
  type VaultStorage,
} from '@aco/core';
import { OpenAiCompatibleLlm, PgRunStore, PgVaultStorage, createDatabase, runMigrations } from '@aco/infra';
import { connectInProcess, connectStdio, type ToolRuntime } from '@aco/mcp-tools';
import type { AppConfig } from './config.ts';

export interface Container {
  config: AppConfig;
  service: ClaimsService;
  orchestrator: Orchestrator<ClaimState>;
  store: RunStore<ClaimState>;
  vault: PiiVault;
  policy: PolicyEngine<ClaimState>;
  tools: ToolRuntime;
  llm: LlmPort;
  logger: Logger;
  readiness(): Promise<{ ok: boolean; checks: Record<string, boolean> }>;
  close(): Promise<void>;
}

export function loadPolicy(path: string): PolicyEngine<ClaimState> {
  return new PolicyEngine<ClaimState>(JSON.parse(readFileSync(path, 'utf8')));
}

export function budgetFrom(config: AppConfig): RunBudget {
  return {
    maxIterations: config.BUDGET_MAX_ITERATIONS,
    maxLlmTokens: config.BUDGET_MAX_LLM_TOKENS,
    maxCostUsd: config.BUDGET_MAX_COST_USD,
    maxToolCalls: config.BUDGET_MAX_TOOL_CALLS,
    maxWallClockMs: config.BUDGET_MAX_WALL_CLOCK_MS,
  };
}

export function createLlm(config: AppConfig): LlmPort {
  if (config.LLM_PROVIDER === 'fake') return new FakeLlm();
  return new OpenAiCompatibleLlm({
    baseUrl: config.LLM_BASE_URL ?? '',
    model: config.LLM_MODEL,
    providerName: config.LLM_PROVIDER_NAME,
    authHeader: config.LLM_AUTH_HEADER,
    timeoutMs: config.LLM_TIMEOUT_MS,
    ...(config.LLM_API_KEY ? { apiKey: config.LLM_API_KEY } : {}),
  });
}

export interface ContainerOverrides {
  llm?: LlmPort;
  clock?: Clock;
  sleep?: Sleep;
  logger?: Logger;
  instanceId?: string;
  store?: RunStore<ClaimState>;
  vaultStorage?: VaultStorage;
}

/** Composition root: the only place that knows about concrete adapters. */
export async function createContainer(
  config: AppConfig,
  overrides: ContainerOverrides = {},
): Promise<Container> {
  const logger = overrides.logger ?? silentLogger;
  let store: RunStore<ClaimState>;
  let vaultStorage: VaultStorage;
  let closeDb: () => Promise<void> = () => Promise.resolve();

  if (overrides.store && overrides.vaultStorage) {
    store = overrides.store;
    vaultStorage = overrides.vaultStorage;
  } else if (config.STORAGE === 'postgres') {
    const { db, pool } = createDatabase(config.DATABASE_URL ?? '', {
      maxConnections: config.DATABASE_MAX_CONNECTIONS,
    });
    if (config.RUN_MIGRATIONS) await runMigrations(db);
    store = new PgRunStore<ClaimState>(db);
    vaultStorage = new PgVaultStorage(db);
    closeDb = () => pool.end();
  } else {
    store = new InMemoryRunStore<ClaimState>(overrides.clock);
    vaultStorage = new InMemoryVaultStorage();
  }

  const vault = new TokenizingVault(
    vaultStorage,
    new PiiCipher(config.piiEncryptionKey),
    config.piiTokenSecret,
  );
  const tools =
    config.MCP_TRANSPORT === 'stdio'
      ? await connectStdio(
          vault,
          (server) => ({
            command: process.execPath,
            args: [fileURLToPath(new URL('./mcp-serve.ts', import.meta.url)), server],
            env: Object.fromEntries(
              Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
            ),
          }),
          { timeoutMs: config.MCP_TOOL_TIMEOUT_MS },
        )
      : await connectInProcess(vault, { timeoutMs: config.MCP_TOOL_TIMEOUT_MS });

  const policy = loadPolicy(config.POLICY_FILE);
  const llm = overrides.llm ?? createLlm(config);
  const orchestrator = new Orchestrator<ClaimState>({
    graph: createClaimsGraph(),
    store,
    gate: policy,
    llm,
    tools: tools.gateway,
    pricing: {
      inputPerMTok: config.LLM_INPUT_PRICE_PER_MTOK,
      outputPerMTok: config.LLM_OUTPUT_PRICE_PER_MTOK,
    },
    budget: budgetFrom(config),
    logger,
    defaultTimeoutMs: config.STEP_TIMEOUT_MS,
    defaultRetry: { maxAttempts: config.STEP_MAX_ATTEMPTS, baseDelayMs: 200, maxDelayMs: 5_000, factor: 2 },
    ...(overrides.clock ? { clock: overrides.clock } : {}),
    ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
    ...(overrides.instanceId ? { instanceId: overrides.instanceId } : {}),
  });
  const service = new ClaimsService({ orchestrator, vault, logger });

  return {
    config,
    service,
    orchestrator,
    store,
    vault,
    policy,
    tools,
    llm,
    logger,
    async readiness() {
      const checks: Record<string, boolean> = {};
      try {
        await store.ping();
        checks.store = true;
      } catch {
        checks.store = false;
      }
      for (const r of await tools.gateway.verify()) checks[`tool:${r.tool}`] = r.ok;
      return { ok: Object.values(checks).every(Boolean), checks };
    },
    async close() {
      await service.drain();
      await tools.close();
      await closeDb();
    },
  };
}
