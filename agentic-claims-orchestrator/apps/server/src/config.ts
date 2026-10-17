import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Role } from '@aco/core';

export const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

export const ApiKeyEntry = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  roles: z.array(Role).min(1),
  /** hex SHA-256 of the API key — raw keys are never configured or stored. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ApiKeyEntry = z.infer<typeof ApiKeyEntry>;

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

    STORAGE: z.enum(['postgres', 'memory']).default('postgres'),
    DATABASE_URL: z.string().optional(),
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive().default(10),
    RUN_MIGRATIONS: bool.default(true),

    LLM_PROVIDER: z.enum(['fake', 'openai_compatible']).default('fake'),
    LLM_BASE_URL: z.url().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_AUTH_HEADER: z.string().default('authorization'),
    LLM_MODEL: z.string().default('gpt-4o-mini'),
    LLM_PROVIDER_NAME: z.string().default('openai_compatible'),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    LLM_INPUT_PRICE_PER_MTOK: z.coerce.number().nonnegative().default(0.15),
    LLM_OUTPUT_PRICE_PER_MTOK: z.coerce.number().nonnegative().default(0.6),

    BUDGET_MAX_ITERATIONS: z.coerce.number().int().positive().default(20),
    BUDGET_MAX_LLM_TOKENS: z.coerce.number().int().positive().default(24_000),
    BUDGET_MAX_COST_USD: z.coerce.number().positive().default(0.25),
    BUDGET_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(40),
    BUDGET_MAX_WALL_CLOCK_MS: z.coerce.number().int().positive().default(600_000),
    STEP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    STEP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),

    MCP_TRANSPORT: z.enum(['in-process', 'stdio']).default('in-process'),
    MCP_TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    POLICY_FILE: z.string().default(`${PROJECT_ROOT}config/claims-policy.json`),

    PII_ENCRYPTION_KEY: z.string().optional(),
    PII_TOKEN_SECRET: z.string().min(16).optional(),

    API_KEYS: z.string().default('[]'),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    OTEL_SERVICE_NAME: z.string().default('agentic-claims-orchestrator'),
    RECOVERY_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),
  })
  .superRefine((c, ctx) => {
    if (c.STORAGE === 'postgres' && !c.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'required when STORAGE=postgres' });
    }
    if (c.LLM_PROVIDER === 'openai_compatible' && !c.LLM_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_BASE_URL'],
        message: 'required when LLM_PROVIDER=openai_compatible',
      });
    }
    if (c.NODE_ENV === 'production' && (!c.PII_ENCRYPTION_KEY || !c.PII_TOKEN_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PII_ENCRYPTION_KEY'],
        message: 'PII keys are required in production',
      });
    }
    if (
      c.MCP_TRANSPORT === 'stdio' &&
      (c.STORAGE !== 'postgres' || !c.PII_ENCRYPTION_KEY || !c.PII_TOKEN_SECRET)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['MCP_TRANSPORT'],
        message: 'stdio tool servers need STORAGE=postgres and explicit PII keys (shared vault)',
      });
    }
    if (c.NODE_ENV === 'production' && c.LLM_PROVIDER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_PROVIDER'],
        message: 'the fake LLM is not allowed in production',
      });
    }
  });

export type RawConfig = z.infer<typeof ConfigSchema>;

export interface AppConfig extends RawConfig {
  apiKeys: ApiKeyEntry[];
  piiEncryptionKey: string;
  piiTokenSecret: string;
  ephemeralKeys: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Empty strings mean "unset" (common with docker/helm templating).
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = ConfigSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`invalid configuration: ${issues}`);
  }
  const c = parsed.data;
  const apiKeys = z.array(ApiKeyEntry).parse(JSON.parse(c.API_KEYS));
  const ephemeralKeys = !c.PII_ENCRYPTION_KEY || !c.PII_TOKEN_SECRET;
  return {
    ...c,
    apiKeys,
    piiEncryptionKey: c.PII_ENCRYPTION_KEY ?? randomBytes(32).toString('base64'),
    piiTokenSecret: c.PII_TOKEN_SECRET ?? randomBytes(32).toString('hex'),
    ephemeralKeys,
  };
}
