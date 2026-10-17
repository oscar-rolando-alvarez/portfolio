import type { ErrorCode } from '../domain/errors.ts';

export type RunStatus = 'running' | 'awaiting_approval' | 'completed' | 'failed';

export interface Usage {
  /** Step executions (including retries). */
  iterations: number;
  retries: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCalls: number;
}

export const emptyUsage = (): Usage => ({
  iterations: 0,
  retries: 0,
  llmCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  toolCalls: 0,
});

export function addUsage(a: Usage, b: Partial<Usage>): Usage {
  return {
    iterations: a.iterations + (b.iterations ?? 0),
    retries: a.retries + (b.retries ?? 0),
    llmCalls: a.llmCalls + (b.llmCalls ?? 0),
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    costUsd: Math.round((a.costUsd + (b.costUsd ?? 0)) * 1e8) / 1e8,
    toolCalls: a.toolCalls + (b.toolCalls ?? 0),
  };
}

export interface RunRecord<S> {
  runId: string;
  tenantId: string;
  idempotencyKey: string;
  graphId: string;
  graphVersion: string;
  status: RunStatus;
  /** Next step to execute (or the step that failed). null once completed. */
  currentStep: string | null;
  state: S;
  usage: Usage;
  version: number;
  lastError: { code: ErrorCode; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type Actor = `system:${string}` | `agent:${string}` | `user:${string}`;

export interface AuditEventInput {
  type: string;
  actor: Actor;
  payload: Record<string, unknown>;
}

export interface AuditEvent extends AuditEventInput {
  runId: string;
  tenantId: string;
  seq: number;
  at: string;
  prevHash: string;
  hash: string;
}

export interface Checkpoint<S> {
  runId: string;
  seq: number;
  step: string;
  status: RunStatus;
  state: S;
  createdAt: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'overridden';

export interface ApprovalRequest {
  approvalId: string;
  runId: string;
  tenantId: string;
  requiredRole: string;
  ruleIds: string[];
  reasons: string[];
  status: ApprovalStatus;
  decidedBy: string | null;
  decision: Record<string, unknown> | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface StepCommit<S> {
  runId: string;
  expectedVersion: number;
  status: RunStatus;
  currentStep: string | null;
  state: S;
  usage: Usage;
  lastError: { code: ErrorCode; message: string } | null;
  /** Step that produced this checkpoint ("__start__" for the initial one). */
  checkpointStep: string;
  events: AuditEventInput[];
  approval?: Omit<ApprovalRequest, 'status' | 'decidedBy' | 'decision' | 'decidedAt' | 'createdAt'>;
}

export interface NewRun<S> {
  runId: string;
  tenantId: string;
  idempotencyKey: string;
  graphId: string;
  graphVersion: string;
  currentStep: string;
  state: S;
}

export interface ApprovalDecisionCommit<S> {
  runId: string;
  tenantId: string;
  approvalId: string;
  decidedBy: string;
  decision: Record<string, unknown>;
  status: Exclude<ApprovalStatus, 'pending'>;
  /** State after applying the human decision (the run moves back to "running"). */
  state: S;
  events: AuditEventInput[];
}

/**
 * Persistence port for durable execution. Implementations MUST make `commitStep` atomic:
 * run row update (optimistic concurrency on `version`), checkpoint insert, audit append and
 * optional approval insert happen in one transaction — that is what makes resume-after-crash safe.
 */
export interface RunStore<S> {
  /** Idempotent on (tenantId, idempotencyKey): returns the existing run with created=false. */
  createRun(run: NewRun<S>, events: AuditEventInput[]): Promise<{ run: RunRecord<S>; created: boolean }>;
  getRun(runId: string, tenantId?: string): Promise<RunRecord<S> | null>;
  commitStep(commit: StepCommit<S>): Promise<RunRecord<S>>;
  /** Lease-based ownership so only one worker drives a run; expired leases can be stolen. */
  acquireLease(runId: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(runId: string, owner: string): Promise<void>;
  /** Runs stuck in "running" whose lease expired (crashed worker). */
  listRecoverable(limit: number): Promise<string[]>;
  listCheckpoints(runId: string): Promise<Checkpoint<S>[]>;
  appendEvents(runId: string, events: AuditEventInput[]): Promise<void>;
  listEvents(runId: string, tenantId?: string): Promise<AuditEvent[]>;
  getApproval(approvalId: string, tenantId?: string): Promise<ApprovalRequest | null>;
  listApprovals(filter: {
    tenantId: string;
    status?: ApprovalStatus;
    roles?: string[];
  }): Promise<ApprovalRequest[]>;
  /** Atomically decides a pending approval and moves the run back to "running". */
  decideApproval(
    commit: ApprovalDecisionCommit<S>,
  ): Promise<{ approval: ApprovalRequest; run: RunRecord<S> }>;
  ping(): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface Logger {
  debug(obj: Record<string, unknown>, msg?: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
