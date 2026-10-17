import { ConcurrencyError, DomainError } from '../domain/errors.ts';
import { chainEvent } from './audit-chain.ts';
import { START } from './graph.ts';
import {
  emptyUsage,
  systemClock,
  type ApprovalDecisionCommit,
  type ApprovalRequest,
  type ApprovalStatus,
  type AuditEvent,
  type AuditEventInput,
  type Checkpoint,
  type Clock,
  type NewRun,
  type RunRecord,
  type RunStore,
  type StepCommit,
} from './types.ts';

/**
 * In-memory RunStore with the same semantics as the PostgreSQL adapter (atomic commits,
 * optimistic concurrency, leases, hash-chained audit). Used by the offline CLI demo, the
 * eval harness and unit tests; the shared contract test suite runs against both.
 */
export class InMemoryRunStore<S> implements RunStore<S> {
  private readonly runs = new Map<string, RunRecord<S>>();
  private readonly keys = new Map<string, string>();
  private readonly checkpoints = new Map<string, Checkpoint<S>[]>();
  private readonly events = new Map<string, AuditEvent[]>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly leases = new Map<string, { owner: string; expiresAt: number }>();
  private readonly clock: Clock;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  private nowIso(): string {
    return this.clock.now().toISOString();
  }

  private append(runId: string, tenantId: string, inputs: AuditEventInput[]): void {
    const list = this.events.get(runId) ?? [];
    for (const input of inputs) {
      const prev = list.at(-1) ?? null;
      list.push(chainEvent(prev, { runId, tenantId, at: this.nowIso() }, structuredClone(input)));
    }
    this.events.set(runId, list);
  }

  private checkpoint(run: RunRecord<S>, step: string): void {
    const list = this.checkpoints.get(run.runId) ?? [];
    list.push({
      runId: run.runId,
      seq: list.length + 1,
      step,
      status: run.status,
      state: structuredClone(run.state),
      createdAt: run.updatedAt,
    });
    this.checkpoints.set(run.runId, list);
  }

  createRun(run: NewRun<S>, events: AuditEventInput[]): Promise<{ run: RunRecord<S>; created: boolean }> {
    const key = `${run.tenantId}|${run.idempotencyKey}`;
    const existingId = this.keys.get(key);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (existing) return Promise.resolve({ run: structuredClone(existing), created: false });
    }
    const now = this.nowIso();
    const record: RunRecord<S> = {
      ...structuredClone(run),
      status: 'running',
      usage: emptyUsage(),
      version: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.runId, record);
    this.keys.set(key, run.runId);
    this.checkpoint(record, START);
    this.append(run.runId, run.tenantId, events);
    return Promise.resolve({ run: structuredClone(record), created: true });
  }

  getRun(runId: string, tenantId?: string): Promise<RunRecord<S> | null> {
    const run = this.runs.get(runId);
    if (!run || (tenantId !== undefined && run.tenantId !== tenantId)) return Promise.resolve(null);
    return Promise.resolve(structuredClone(run));
  }

  commitStep(commit: StepCommit<S>): Promise<RunRecord<S>> {
    const run = this.runs.get(commit.runId);
    if (!run) return Promise.reject(new DomainError('NOT_FOUND', `run ${commit.runId} not found`));
    if (run.version !== commit.expectedVersion) {
      return Promise.reject(
        new ConcurrencyError(
          `run ${commit.runId}: expected v${commit.expectedVersion}, found v${run.version}`,
        ),
      );
    }
    const updated: RunRecord<S> = {
      ...run,
      status: commit.status,
      currentStep: commit.currentStep,
      state: structuredClone(commit.state),
      usage: { ...commit.usage },
      lastError: commit.lastError,
      version: run.version + 1,
      updatedAt: this.nowIso(),
    };
    this.runs.set(run.runId, updated);
    this.checkpoint(updated, commit.checkpointStep);
    if (commit.approval) {
      this.approvals.set(commit.approval.approvalId, {
        ...structuredClone(commit.approval),
        status: 'pending',
        decidedBy: null,
        decision: null,
        createdAt: updated.updatedAt,
        decidedAt: null,
      });
    }
    this.append(run.runId, run.tenantId, commit.events);
    return Promise.resolve(structuredClone(updated));
  }

  acquireLease(runId: string, owner: string, ttlMs: number): Promise<boolean> {
    const now = this.clock.now().getTime();
    const lease = this.leases.get(runId);
    if (lease && lease.owner !== owner && lease.expiresAt > now) return Promise.resolve(false);
    this.leases.set(runId, { owner, expiresAt: now + ttlMs });
    return Promise.resolve(true);
  }

  releaseLease(runId: string, owner: string): Promise<void> {
    if (this.leases.get(runId)?.owner === owner) this.leases.delete(runId);
    return Promise.resolve();
  }

  listRecoverable(limit: number, graphId?: string): Promise<string[]> {
    const now = this.clock.now().getTime();
    const ids = [...this.runs.values()]
      .filter((r) => r.status === 'running' && (graphId === undefined || r.graphId === graphId))
      .filter((r) => {
        const lease = this.leases.get(r.runId);
        return !lease || lease.expiresAt <= now;
      })
      .map((r) => r.runId)
      .slice(0, limit);
    return Promise.resolve(ids);
  }

  listCheckpoints(runId: string): Promise<Checkpoint<S>[]> {
    return Promise.resolve(structuredClone(this.checkpoints.get(runId) ?? []));
  }

  appendEvents(runId: string, events: AuditEventInput[]): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return Promise.reject(new DomainError('NOT_FOUND', `run ${runId} not found`));
    this.append(runId, run.tenantId, events);
    return Promise.resolve();
  }

  listEvents(runId: string, tenantId?: string): Promise<AuditEvent[]> {
    const run = this.runs.get(runId);
    if (!run || (tenantId !== undefined && run.tenantId !== tenantId)) return Promise.resolve([]);
    return Promise.resolve(structuredClone(this.events.get(runId) ?? []));
  }

  getApproval(approvalId: string, tenantId?: string): Promise<ApprovalRequest | null> {
    const a = this.approvals.get(approvalId);
    if (!a || (tenantId !== undefined && a.tenantId !== tenantId)) return Promise.resolve(null);
    return Promise.resolve(structuredClone(a));
  }

  listApprovals(filter: {
    tenantId: string;
    status?: ApprovalStatus;
    roles?: string[];
  }): Promise<ApprovalRequest[]> {
    const list = [...this.approvals.values()]
      .filter((a) => a.tenantId === filter.tenantId)
      .filter((a) => filter.status === undefined || a.status === filter.status)
      .filter((a) => filter.roles === undefined || filter.roles.includes(a.requiredRole))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.resolve(structuredClone(list));
  }

  decideApproval(
    commit: ApprovalDecisionCommit<S>,
  ): Promise<{ approval: ApprovalRequest; run: RunRecord<S> }> {
    const approval = this.approvals.get(commit.approvalId);
    const run = this.runs.get(commit.runId);
    if (approval?.tenantId !== commit.tenantId || !run) {
      return Promise.reject(new DomainError('NOT_FOUND', 'approval not found'));
    }
    if (approval.status !== 'pending' || run.status !== 'awaiting_approval') {
      return Promise.reject(new ConcurrencyError('approval already decided'));
    }
    const now = this.nowIso();
    const decided: ApprovalRequest = {
      ...approval,
      status: commit.status,
      decidedBy: commit.decidedBy,
      decision: structuredClone(commit.decision),
      decidedAt: now,
    };
    this.approvals.set(approval.approvalId, decided);
    const updated: RunRecord<S> = {
      ...run,
      status: 'running',
      state: structuredClone(commit.state),
      version: run.version + 1,
      updatedAt: now,
    };
    this.runs.set(run.runId, updated);
    this.checkpoint(updated, 'human_review');
    this.append(run.runId, run.tenantId, commit.events);
    return Promise.resolve({ approval: structuredClone(decided), run: structuredClone(updated) });
  }

  ping(): Promise<void> {
    return Promise.resolve();
  }
}
