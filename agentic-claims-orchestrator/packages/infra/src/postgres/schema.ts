import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const runs = pgTable(
  'runs',
  {
    runId: uuid('run_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    graphId: text('graph_id').notNull(),
    graphVersion: text('graph_version').notNull(),
    status: text('status', { enum: ['running', 'awaiting_approval', 'completed', 'failed'] }).notNull(),
    currentStep: text('current_step'),
    state: jsonb('state').notNull(),
    usage: jsonb('usage').notNull(),
    version: integer('version').notNull(),
    lastError: jsonb('last_error'),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('runs_tenant_idempotency_uq').on(t.tenantId, t.idempotencyKey),
    index('runs_recoverable_idx').on(t.status, t.leaseExpiresAt),
  ],
);

export const checkpoints = pgTable(
  'checkpoints',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.runId, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    step: text('step').notNull(),
    status: text('status').notNull(),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq] })],
);

/** Append-only, hash-chained audit trail (UPDATE/DELETE revoked from the app role in production). */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.runId, { onDelete: 'restrict' }),
    tenantId: text('tenant_id').notNull(),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    actor: text('actor').notNull(),
    payload: jsonb('payload').notNull(),
    at: text('at').notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [
    uniqueIndex('audit_run_seq_uq').on(t.runId, t.seq),
    index('audit_tenant_type_idx').on(t.tenantId, t.type),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    approvalId: uuid('approval_id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.runId, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    requiredRole: text('required_role').notNull(),
    ruleIds: jsonb('rule_ids').$type<string[]>().notNull(),
    reasons: jsonb('reasons').$type<string[]>().notNull(),
    status: text('status', { enum: ['pending', 'approved', 'overridden'] }).notNull(),
    decidedBy: text('decided_by'),
    decision: jsonb('decision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('approvals_queue_idx')
      .on(t.tenantId, t.requiredRole, t.createdAt)
      .where(sql`status = 'pending'`),
  ],
);

/** PII vault: tenant-scoped token -> AES-256-GCM ciphertext. */
export const piiVault = pgTable(
  'pii_vault',
  {
    tenantId: text('tenant_id').notNull(),
    token: text('token').notNull(),
    kind: text('kind').notNull(),
    ciphertext: text('ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.token] })],
);
