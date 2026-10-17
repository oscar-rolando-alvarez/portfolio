import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  ConcurrencyError,
  DomainError,
  START,
  chainEvent,
  emptyUsage,
  type ApprovalDecisionCommit,
  type ApprovalRequest,
  type ApprovalStatus,
  type AuditEvent,
  type AuditEventInput,
  type Checkpoint,
  type ErrorCode,
  type NewRun,
  type RunRecord,
  type RunStatus,
  type RunStore,
  type StepCommit,
  type Usage,
} from '@aco/core';
import * as schema from './schema.ts';

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type RunRow = typeof schema.runs.$inferSelect;
type ApprovalRow = typeof schema.approvals.$inferSelect;

/**
 * PostgreSQL RunStore. Every state transition is one transaction that (1) locks the run row,
 * (2) checks the optimistic version, (3) writes the run, a checkpoint, optional approval and
 * hash-chained audit events. Crash at any point => either all or nothing is visible.
 */
export class PgRunStore<S> implements RunStore<S> {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  private toRecord(row: RunRow): RunRecord<S> {
    return {
      runId: row.runId,
      tenantId: row.tenantId,
      idempotencyKey: row.idempotencyKey,
      graphId: row.graphId,
      graphVersion: row.graphVersion,
      status: row.status,
      currentStep: row.currentStep,
      state: row.state as S,
      usage: row.usage as Usage,
      version: row.version,
      lastError: (row.lastError as { code: ErrorCode; message: string } | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toApproval(row: ApprovalRow): ApprovalRequest {
    return {
      approvalId: row.approvalId,
      runId: row.runId,
      tenantId: row.tenantId,
      requiredRole: row.requiredRole,
      ruleIds: row.ruleIds,
      reasons: row.reasons,
      status: row.status,
      decidedBy: row.decidedBy,
      decision: (row.decision as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    };
  }

  private async appendTx(tx: Tx, runId: string, tenantId: string, inputs: AuditEventInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const [last] = await tx
      .select({ seq: schema.auditEvents.seq, hash: schema.auditEvents.hash })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.runId, runId))
      .orderBy(desc(schema.auditEvents.seq))
      .limit(1);
    let prev: { seq: number; hash: string } | null = last ?? null;
    const rows: AuditEvent[] = [];
    for (const input of inputs) {
      const e = chainEvent(prev, { runId, tenantId, at: new Date().toISOString() }, input);
      rows.push(e);
      prev = e;
    }
    await tx.insert(schema.auditEvents).values(rows);
  }

  private async checkpointTx(
    tx: Tx,
    runId: string,
    step: string,
    status: RunStatus,
    state: S,
  ): Promise<void> {
    await tx.insert(schema.checkpoints).values({
      runId,
      step,
      status,
      state,
      seq: sql`(SELECT COALESCE(MAX(seq), 0) + 1 FROM ${schema.checkpoints} WHERE run_id = ${runId})`,
    });
  }

  async createRun(
    run: NewRun<S>,
    events: AuditEventInput[],
  ): Promise<{ run: RunRecord<S>; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.runs)
        .values({
          runId: run.runId,
          tenantId: run.tenantId,
          idempotencyKey: run.idempotencyKey,
          graphId: run.graphId,
          graphVersion: run.graphVersion,
          status: 'running',
          currentStep: run.currentStep,
          state: run.state,
          usage: emptyUsage(),
          version: 1,
        })
        .onConflictDoNothing({ target: [schema.runs.tenantId, schema.runs.idempotencyKey] })
        .returning();
      const row = inserted[0];
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.runs)
          .where(
            and(eq(schema.runs.tenantId, run.tenantId), eq(schema.runs.idempotencyKey, run.idempotencyKey)),
          );
        if (!existing) throw new ConcurrencyError('idempotency conflict without existing row');
        return { run: this.toRecord(existing), created: false };
      }
      await this.checkpointTx(tx, run.runId, START, 'running', run.state);
      await this.appendTx(tx, run.runId, run.tenantId, events);
      return { run: this.toRecord(row), created: true };
    });
  }

  async getRun(runId: string, tenantId?: string): Promise<RunRecord<S> | null> {
    const where =
      tenantId === undefined
        ? eq(schema.runs.runId, runId)
        : and(eq(schema.runs.runId, runId), eq(schema.runs.tenantId, tenantId));
    const [row] = await this.db.select().from(schema.runs).where(where);
    return row ? this.toRecord(row) : null;
  }

  async commitStep(commit: StepCommit<S>): Promise<RunRecord<S>> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.runs)
        .where(eq(schema.runs.runId, commit.runId))
        .for('update');
      if (!current) throw new DomainError('NOT_FOUND', `run ${commit.runId} not found`);
      if (current.version !== commit.expectedVersion) {
        throw new ConcurrencyError(
          `run ${commit.runId}: expected v${commit.expectedVersion}, found v${current.version}`,
        );
      }
      const [updated] = await tx
        .update(schema.runs)
        .set({
          status: commit.status,
          currentStep: commit.currentStep,
          state: commit.state,
          usage: commit.usage,
          lastError: commit.lastError,
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.runs.runId, commit.runId))
        .returning();
      if (!updated) throw new ConcurrencyError('run vanished during commit');
      await this.checkpointTx(tx, commit.runId, commit.checkpointStep, commit.status, commit.state);
      if (commit.approval) {
        await tx.insert(schema.approvals).values({ ...commit.approval, status: 'pending' });
      }
      await this.appendTx(tx, commit.runId, current.tenantId, commit.events);
      return this.toRecord(updated);
    });
  }

  async acquireLease(runId: string, owner: string, ttlMs: number): Promise<boolean> {
    const rows = await this.db
      .update(schema.runs)
      .set({
        leaseOwner: owner,
        leaseExpiresAt: sql`now() + make_interval(secs => ${ttlMs / 1000})`,
      })
      .where(
        and(
          eq(schema.runs.runId, runId),
          or(
            isNull(schema.runs.leaseOwner),
            eq(schema.runs.leaseOwner, owner),
            lt(schema.runs.leaseExpiresAt, sql`now()`),
          ),
        ),
      )
      .returning({ runId: schema.runs.runId });
    return rows.length === 1;
  }

  async releaseLease(runId: string, owner: string): Promise<void> {
    await this.db
      .update(schema.runs)
      .set({ leaseOwner: null, leaseExpiresAt: null })
      .where(and(eq(schema.runs.runId, runId), eq(schema.runs.leaseOwner, owner)));
  }

  async listRecoverable(limit: number, graphId?: string): Promise<string[]> {
    const rows = await this.db
      .select({ runId: schema.runs.runId })
      .from(schema.runs)
      .where(
        and(
          eq(schema.runs.status, 'running'),
          graphId === undefined ? undefined : eq(schema.runs.graphId, graphId),
          or(isNull(schema.runs.leaseExpiresAt), lt(schema.runs.leaseExpiresAt, sql`now()`)),
        ),
      )
      .orderBy(asc(schema.runs.updatedAt))
      .limit(limit);
    return rows.map((r) => r.runId);
  }

  async listCheckpoints(runId: string): Promise<Checkpoint<S>[]> {
    const rows = await this.db
      .select()
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.runId, runId))
      .orderBy(asc(schema.checkpoints.seq));
    return rows.map((r) => ({
      runId: r.runId,
      seq: r.seq,
      step: r.step,
      status: r.status as RunStatus,
      state: r.state as S,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async appendEvents(runId: string, events: AuditEventInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(schema.runs).where(eq(schema.runs.runId, runId)).for('update');
      if (!run) throw new DomainError('NOT_FOUND', `run ${runId} not found`);
      await this.appendTx(tx, runId, run.tenantId, events);
    });
  }

  async listEvents(runId: string, tenantId?: string): Promise<AuditEvent[]> {
    const where =
      tenantId === undefined
        ? eq(schema.auditEvents.runId, runId)
        : and(eq(schema.auditEvents.runId, runId), eq(schema.auditEvents.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(schema.auditEvents)
      .where(where)
      .orderBy(asc(schema.auditEvents.seq));
    return rows.map((r) => ({
      runId: r.runId,
      tenantId: r.tenantId,
      seq: r.seq,
      at: r.at,
      type: r.type,
      actor: r.actor as AuditEvent['actor'],
      payload: r.payload as Record<string, unknown>,
      prevHash: r.prevHash,
      hash: r.hash,
    }));
  }

  async getApproval(approvalId: string, tenantId?: string): Promise<ApprovalRequest | null> {
    const where =
      tenantId === undefined
        ? eq(schema.approvals.approvalId, approvalId)
        : and(eq(schema.approvals.approvalId, approvalId), eq(schema.approvals.tenantId, tenantId));
    const [row] = await this.db.select().from(schema.approvals).where(where);
    return row ? this.toApproval(row) : null;
  }

  async listApprovals(filter: {
    tenantId: string;
    status?: ApprovalStatus;
    roles?: string[];
  }): Promise<ApprovalRequest[]> {
    const conds = [eq(schema.approvals.tenantId, filter.tenantId)];
    if (filter.status) conds.push(eq(schema.approvals.status, filter.status));
    if (filter.roles) {
      if (filter.roles.length === 0) return [];
      conds.push(inArray(schema.approvals.requiredRole, filter.roles));
    }
    const rows = await this.db
      .select()
      .from(schema.approvals)
      .where(and(...conds))
      .orderBy(asc(schema.approvals.createdAt))
      .limit(500);
    return rows.map((r) => this.toApproval(r));
  }

  async decideApproval(
    commit: ApprovalDecisionCommit<S>,
  ): Promise<{ approval: ApprovalRequest; run: RunRecord<S> }> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(schema.runs)
        .where(and(eq(schema.runs.runId, commit.runId), eq(schema.runs.tenantId, commit.tenantId)))
        .for('update');
      const [approval] = await tx
        .select()
        .from(schema.approvals)
        .where(
          and(
            eq(schema.approvals.approvalId, commit.approvalId),
            eq(schema.approvals.tenantId, commit.tenantId),
          ),
        )
        .for('update');
      if (!run || !approval) throw new DomainError('NOT_FOUND', 'approval not found');
      if (approval.status !== 'pending' || run.status !== 'awaiting_approval') {
        throw new ConcurrencyError('approval already decided');
      }
      const [decided] = await tx
        .update(schema.approvals)
        .set({
          status: commit.status,
          decidedBy: commit.decidedBy,
          decision: commit.decision,
          decidedAt: new Date(),
        })
        .where(eq(schema.approvals.approvalId, commit.approvalId))
        .returning();
      const [updated] = await tx
        .update(schema.runs)
        .set({ status: 'running', state: commit.state, version: run.version + 1, updatedAt: new Date() })
        .where(eq(schema.runs.runId, commit.runId))
        .returning();
      if (!decided || !updated) throw new ConcurrencyError('approval decision lost');
      await this.checkpointTx(tx, commit.runId, 'human_review', 'running', commit.state);
      await this.appendTx(tx, commit.runId, commit.tenantId, commit.events);
      return { approval: this.toApproval(decided), run: this.toRecord(updated) };
    });
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
