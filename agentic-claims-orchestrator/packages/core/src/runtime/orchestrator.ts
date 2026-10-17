import { randomUUID } from 'node:crypto';
import { SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import {
  BudgetExceededError,
  ConcurrencyError,
  DomainError,
  PolicyViolationError,
  toErrorInfo,
} from '../domain/errors.ts';
import { ScopedLlm, type UsageMeter } from '../llm/scoped-llm.ts';
import type { LlmPort, LlmPricing } from '../llm/types.ts';
import type { Gate, GateVerdict } from '../policy/engine.ts';
import { maskReplacer, redactPii } from '../privacy/dlp.ts';
import { claimMetrics, recordRunFinished } from '../telemetry/metrics.ts';
import { Claims, GenAi, tracer } from '../telemetry/semconv.ts';
import type { ToolCallOptions, ToolGateway, ToolIo, ToolName } from '../tools/contracts.ts';
import { canonicalJson, sha256 } from './audit-chain.ts';
import { checkBudget, defaultBudget, type RunBudget } from './budget.ts';
import { END, START, type Graph, type StepContext } from './graph.ts';
import { defaultRetryPolicy, realSleep, runWithRetry, type RetryPolicy, type Sleep } from './retry.ts';
import {
  addUsage,
  emptyUsage,
  silentLogger,
  systemClock,
  type AuditEventInput,
  type Clock,
  type Logger,
  type RunRecord,
  type RunStore,
  type StepCommit,
  type Usage,
} from './types.ts';

export interface OrchestratorDeps<S> {
  graph: Graph<S>;
  store: RunStore<S>;
  gate: Gate<S>;
  llm: LlmPort;
  tools: ToolGateway;
  pricing: LlmPricing;
  budget?: RunBudget;
  clock?: Clock;
  logger?: Logger;
  sleep?: Sleep;
  random?: () => number;
  instanceId?: string;
  leaseTtlMs?: number;
  defaultTimeoutMs?: number;
  defaultRetry?: RetryPolicy;
  newId?: () => string;
}

const RESUMABLE_ERRORS = new Set([
  'TRANSIENT',
  'TIMEOUT',
  'STEP_FAILED',
  'TOOL_FAILED',
  'LLM_FAILED',
  'CONCURRENCY',
]);

type StepOutcome<S> =
  | { ok: true; state: S; attempts: number; events: AuditEventInput[]; usage: Partial<Usage> }
  | { ok: false; error: unknown; attempts: number; events: AuditEventInput[]; usage: Partial<Usage> };

/**
 * Durable, governed graph executor.
 *
 * Invariants:
 *  - State is checkpointed (atomically with audit events) after every step, so a crash loses
 *    at most the in-flight step, which is re-executed on recovery (steps are idempotent reads
 *    + deterministic transforms; tool calls carry idempotency keys).
 *  - Exactly one worker drives a run at a time (lease) and every commit is version-checked.
 *  - The policy gate runs after every step; "require_approval" pauses the run durably.
 *  - Budgets are enforced before every step and before every LLM/tool call.
 */
export class Orchestrator<S> {
  private readonly d: Required<Omit<OrchestratorDeps<S>, 'budget'>> & { budget: RunBudget };

  constructor(deps: OrchestratorDeps<S>) {
    this.d = {
      budget: deps.budget ?? defaultBudget,
      clock: deps.clock ?? systemClock,
      logger: deps.logger ?? silentLogger,
      sleep: deps.sleep ?? realSleep,
      random: deps.random ?? Math.random,
      instanceId: deps.instanceId ?? `worker-${randomUUID().slice(0, 8)}`,
      leaseTtlMs: deps.leaseTtlMs ?? 60_000,
      defaultTimeoutMs: deps.defaultTimeoutMs ?? 30_000,
      defaultRetry: deps.defaultRetry ?? defaultRetryPolicy,
      newId: deps.newId ?? randomUUID,
      graph: deps.graph,
      store: deps.store,
      gate: deps.gate,
      llm: deps.llm,
      tools: deps.tools,
      pricing: deps.pricing,
    };
  }

  get graph(): Graph<S> {
    return this.d.graph;
  }

  get store(): RunStore<S> {
    return this.d.store;
  }

  /** Creates (or returns, if the idempotency key was seen) a run. Does not execute it. */
  async start(params: {
    tenantId: string;
    idempotencyKey: string;
    runId?: string;
    initialState: (runId: string) => S;
    actor: `user:${string}` | `system:${string}`;
  }): Promise<{ run: RunRecord<S>; created: boolean }> {
    const runId = params.runId ?? this.d.newId();
    const state = params.initialState(runId);
    const events = await this.sanitize([
      {
        type: 'run.created',
        actor: params.actor,
        payload: {
          graphId: this.d.graph.id,
          graphVersion: this.d.graph.version,
          policyVersion: this.d.gate.policyVersion,
          idempotencyKey: params.idempotencyKey,
          budget: { ...this.d.budget },
        },
      },
    ]);
    return this.d.store.createRun(
      {
        runId,
        tenantId: params.tenantId,
        idempotencyKey: params.idempotencyKey,
        graphId: this.d.graph.id,
        graphVersion: this.d.graph.version,
        currentStep: this.d.graph.def.entry,
        state,
      },
      events,
    );
  }

  /** Executes the run until it completes, fails, or pauses for approval. Safe to call concurrently. */
  async drive(runId: string): Promise<RunRecord<S>> {
    const { store, instanceId, leaseTtlMs } = this.d;
    if (!(await store.acquireLease(runId, instanceId, leaseTtlMs))) {
      const current = await store.getRun(runId);
      if (!current) throw new DomainError('NOT_FOUND', `run ${runId} not found`);
      return current;
    }
    const sessionStart = this.d.clock.now().getTime();
    try {
      return await tracer().startActiveSpan(
        `claims.run ${this.d.graph.id}`,
        { kind: SpanKind.INTERNAL, attributes: { [Claims.RUN_ID]: runId, [GenAi.CONVERSATION_ID]: runId } },
        async (span) => {
          try {
            const run = await this.loop(runId, sessionStart);
            span.setAttribute(Claims.STATUS, run.status);
            return run;
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
          } finally {
            span.end();
          }
        },
      );
    } finally {
      await store.releaseLease(runId, instanceId).catch(() => undefined);
    }
  }

  private async loop(runId: string, sessionStart: number): Promise<RunRecord<S>> {
    const { store, graph, gate } = this.d;
    for (;;) {
      const run = await store.getRun(runId);
      if (!run) throw new DomainError('NOT_FOUND', `run ${runId} not found`);
      if (run.status !== 'running' || run.currentStep === null) return run;
      await store.acquireLease(runId, this.d.instanceId, this.d.leaseTtlMs); // heartbeat

      const stepName = run.currentStep;
      try {
        checkBudget(this.d.budget, run.usage, this.d.clock.now().getTime() - sessionStart);
      } catch (err) {
        return this.fail(run, stepName, err, [], {});
      }

      const outcome = await this.executeStep(run, stepName);
      if (!outcome.ok) {
        return this.fail(run, stepName, outcome.error, outcome.events, outcome.usage);
      }

      let state = outcome.state;
      const verdict = gate.evaluate(stepName, state);
      if (graph.def.annotateVerdict) state = graph.def.annotateVerdict(state, stepName, verdict);
      const next = graph.next(stepName, state);
      const events = [...outcome.events];
      if (verdict.matched.length > 0) {
        events.push({
          type: 'policy.evaluated',
          actor: 'system:policy-engine',
          payload: this.verdictPayload(stepName, verdict),
        });
      }

      const usage = addUsage(run.usage, outcome.usage);
      const base = {
        runId,
        expectedVersion: run.version,
        state,
        usage,
        checkpointStep: stepName,
      };
      events.push({
        type: 'step.completed',
        actor: 'system:orchestrator',
        payload: { step: stepName, attempts: outcome.attempts, next: next === END ? null : next },
      });

      let commit: StepCommit<S>;
      if (verdict.effect === 'block') {
        events.push({
          type: 'run.failed',
          actor: 'system:policy-engine',
          payload: { step: stepName, code: 'POLICY_BLOCKED', ruleIds: verdict.matched.map((m) => m.ruleId) },
        });
        claimMetrics().policyViolations.add(1, {
          rule: verdict.matched[0]?.ruleId ?? 'unknown',
          sink: 'action',
        });
        commit = {
          ...base,
          status: 'failed',
          currentStep: stepName,
          lastError: {
            code: 'POLICY_BLOCKED',
            message: `blocked by ${verdict.matched.map((m) => m.ruleId).join(', ')}`,
          },
          events,
        };
      } else if (verdict.effect === 'require_approval' && verdict.requiredRole !== null) {
        const approvalId = this.d.newId();
        events.push({
          type: 'approval.requested',
          actor: 'system:policy-engine',
          payload: {
            approvalId,
            requiredRole: verdict.requiredRole,
            ruleIds: verdict.matched.map((m) => m.ruleId),
            policyVersion: verdict.policyVersion,
          },
        });
        commit = {
          ...base,
          status: 'awaiting_approval',
          currentStep: next === END ? null : next,
          lastError: null,
          events,
          approval: {
            approvalId,
            runId,
            tenantId: run.tenantId,
            requiredRole: verdict.requiredRole,
            ruleIds: verdict.matched.map((m) => m.ruleId),
            reasons: verdict.matched.map((m) => m.description),
          },
        };
      } else if (next === END) {
        events.push({ type: 'run.completed', actor: 'system:orchestrator', payload: { usage } });
        commit = { ...base, status: 'completed', currentStep: null, lastError: null, events };
      } else {
        commit = { ...base, status: 'running', currentStep: next, lastError: null, events };
      }

      let saved: RunRecord<S>;
      try {
        saved = await store.commitStep({ ...commit, events: await this.sanitize(commit.events) });
      } catch (err) {
        if (err instanceof ConcurrencyError) {
          this.d.logger.warn({ runId, step: stepName }, 'concurrent modification detected; yielding run');
          const latest = await store.getRun(runId);
          if (latest) return latest;
        }
        throw err;
      }
      this.d.logger.info({ runId, step: stepName, status: saved.status, next }, 'step committed');
      if (saved.status !== 'running') {
        recordRunFinished({ [Claims.STATUS]: saved.status, step: stepName });
        return saved;
      }
    }
  }

  private verdictPayload(stage: string, v: GateVerdict): Record<string, unknown> {
    return {
      stage,
      effect: v.effect,
      requiredRole: v.requiredRole,
      ruleIds: v.matched.map((m) => m.ruleId),
      policyId: v.policyId,
      policyVersion: v.policyVersion,
    };
  }

  private async fail(
    run: RunRecord<S>,
    stepName: string,
    error: unknown,
    events: AuditEventInput[],
    usageDelta: Partial<Usage>,
  ): Promise<RunRecord<S>> {
    const info = toErrorInfo(error);
    this.d.logger.error(
      { runId: run.runId, step: stepName, code: info.code, err: info.message },
      'run failed',
    );
    const saved = await this.d.store.commitStep({
      runId: run.runId,
      expectedVersion: run.version,
      status: 'failed',
      currentStep: stepName,
      state: run.state,
      usage: addUsage(run.usage, usageDelta),
      lastError: info,
      checkpointStep: stepName,
      events: await this.sanitize([
        ...events,
        {
          type: 'run.failed',
          actor: 'system:orchestrator',
          payload: { step: stepName, code: info.code, message: info.message },
        },
      ]),
    });
    recordRunFinished({ [Claims.STATUS]: 'failed', step: stepName, code: info.code });
    return saved;
  }

  private async executeStep(run: RunRecord<S>, stepName: string): Promise<StepOutcome<S>> {
    const { graph, gate } = this.d;
    const step = graph.step(stepName);
    const persistentEvents: AuditEventInput[] = [];
    const meters: UsageMeter[] = [];
    let retries = 0;
    let committedEvents: AuditEventInput[] = [];
    const started = performance.now();
    const sumUsage = (): Partial<Usage> =>
      meters.reduce<Usage>((acc, m) => addUsage(acc, m.delta), addUsage(emptyUsage(), { retries }));

    const spanName = step.kind === 'agent' ? `invoke_agent ${stepName}` : `step ${stepName}`;
    return tracer().startActiveSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          [GenAi.OPERATION_NAME]: step.kind === 'agent' ? 'invoke_agent' : 'step',
          [GenAi.AGENT_NAME]: stepName,
          [GenAi.AGENT_DESCRIPTION]: step.description,
          [GenAi.CONVERSATION_ID]: run.runId,
          [Claims.RUN_ID]: run.runId,
          [Claims.TENANT_ID]: run.tenantId,
          [Claims.STEP]: stepName,
        },
      },
      async (span: Span): Promise<StepOutcome<S>> => {
        try {
          const { value, attempts } = await runWithRetry(
            async (attempt, signal) => {
              const meter: UsageMeter = {
                base: addUsage(run.usage, sumUsage()),
                delta: { iterations: 1 },
              };
              meters.push(meter);
              const attemptEvents: AuditEventInput[] = [];
              const ctx: StepContext = {
                runId: run.runId,
                tenantId: run.tenantId,
                step: stepName,
                attempt,
                signal,
                clock: this.d.clock,
                logger: this.d.logger,
                llm: new ScopedLlm(this.d.llm, {
                  pricing: this.d.pricing,
                  budget: this.d.budget,
                  meter,
                  runId: run.runId,
                  step: stepName,
                  egressRuleId: gate.egressRuleId,
                  onEgressViolation: (v) =>
                    persistentEvents.push({
                      type: 'policy.violation',
                      actor: 'system:dlp',
                      payload: { ...v, step: stepName },
                    }),
                }),
                tools: this.scopedTools(run, stepName, signal, meter, attemptEvents, persistentEvents),
                emit: (e) => attemptEvents.push({ ...e, actor: `agent:${stepName}` }),
              };
              const next = await step.execute(structuredClone(run.state), ctx);
              committedEvents = attemptEvents;
              return next;
            },
            {
              policy: { ...this.d.defaultRetry, ...step.retry },
              timeoutMs: step.timeoutMs ?? this.d.defaultTimeoutMs,
              label: stepName,
              sleep: this.d.sleep,
              random: this.d.random,
              onAttemptFailed: ({ attempt, error, delayMs, willRetry }) => {
                const info = toErrorInfo(error);
                if (willRetry) retries += 1;
                persistentEvents.push({
                  type: 'step.attempt_failed',
                  actor: 'system:orchestrator',
                  payload: {
                    step: stepName,
                    attempt,
                    code: info.code,
                    message: info.message,
                    willRetry,
                    backoffMs: delayMs,
                  },
                });
              },
            },
          );
          span.setAttribute(Claims.ATTEMPT, attempts);
          return {
            ok: true,
            state: value,
            attempts,
            events: [...persistentEvents, ...committedEvents],
            usage: sumUsage(),
          };
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: toErrorInfo(error).message });
          span.setAttribute(GenAi.ERROR_TYPE, toErrorInfo(error).code);
          return { ok: false, error, attempts: meters.length, events: persistentEvents, usage: sumUsage() };
        } finally {
          claimMetrics().stepDuration.record((performance.now() - started) / 1000, {
            [Claims.STEP]: stepName,
          });
          span.end();
        }
      },
    );
  }

  /** Least-privilege, metered, audited tool handle for one step attempt. */
  private scopedTools(
    run: RunRecord<S>,
    stepName: string,
    signal: AbortSignal,
    meter: UsageMeter,
    attemptEvents: AuditEventInput[],
    persistentEvents: AuditEventInput[],
  ): ToolGateway {
    const granted = new Set(this.d.gate.allowedTools(stepName));
    const budget = this.d.budget;
    const inner = this.d.tools;
    return {
      call: async <N extends ToolName>(
        name: N,
        input: ToolIo[N]['input'],
        opts: ToolCallOptions = {},
      ): Promise<ToolIo[N]['output']> => {
        if (!granted.has(name)) {
          persistentEvents.push({
            type: 'policy.violation',
            actor: 'system:policy-engine',
            payload: { ruleId: 'TOOL-GRANT', step: stepName, tool: name },
          });
          claimMetrics().policyViolations.add(1, { rule: 'TOOL-GRANT', sink: 'tool' });
          throw new PolicyViolationError('TOOL-GRANT', `step "${stepName}" is not granted tool "${name}"`);
        }
        const calls = meter.base.toolCalls + (meter.delta.toolCalls ?? 0) + 1;
        if (calls > budget.maxToolCalls)
          throw new BudgetExceededError('tool_calls', budget.maxToolCalls, calls);
        meter.delta = { ...meter.delta, toolCalls: (meter.delta.toolCalls ?? 0) + 1 };
        const idempotencyKey =
          opts.idempotencyKey ??
          `${run.runId}:${stepName}:${name}:${sha256(canonicalJson(input)).slice(0, 16)}`;
        const t0 = performance.now();
        try {
          const out = await inner.call(name, input, { signal: opts.signal ?? signal, idempotencyKey });
          attemptEvents.push({
            type: 'tool.called',
            actor: `agent:${stepName}`,
            payload: { tool: name, ok: true, durationMs: Math.round(performance.now() - t0), idempotencyKey },
          });
          claimMetrics().toolCalls.add(1, { [GenAi.TOOL_NAME]: name, ok: true });
          return out;
        } catch (err) {
          persistentEvents.push({
            type: 'tool.called',
            actor: `agent:${stepName}`,
            payload: {
              tool: name,
              ok: false,
              durationMs: Math.round(performance.now() - t0),
              idempotencyKey,
              code: toErrorInfo(err).code,
            },
          });
          claimMetrics().toolCalls.add(1, { [GenAi.TOOL_NAME]: name, ok: false });
          throw err;
        }
      },
    };
  }

  /**
   * Records a human decision on a pending approval and resumes the run. Idempotent: re-sending
   * the same decision returns the current run; a conflicting decision is rejected.
   */
  async decide(params: {
    tenantId: string;
    runId: string;
    approvalId: string;
    decidedBy: string;
    decision: Record<string, unknown>;
    status: 'approved' | 'overridden';
  }): Promise<RunRecord<S>> {
    const { store, graph } = this.d;
    const approval = await store.getApproval(params.approvalId, params.tenantId);
    if (approval?.runId !== params.runId) throw new DomainError('NOT_FOUND', 'approval not found');
    if (approval.status !== 'pending') {
      const same =
        approval.decidedBy === params.decidedBy &&
        canonicalJson(approval.decision) === canonicalJson(params.decision);
      if (!same) throw new DomainError('CONFLICT', `approval already ${approval.status}`);
      const run = await store.getRun(params.runId, params.tenantId);
      if (!run) throw new DomainError('NOT_FOUND', 'run not found');
      return run.status === 'running' ? this.drive(run.runId) : run;
    }
    const run = await store.getRun(params.runId, params.tenantId);
    if (run?.status !== 'awaiting_approval') {
      throw new DomainError('CONFLICT', 'run is not awaiting approval');
    }
    const state = graph.def.applyHumanDecision(run.state, {
      approvalId: params.approvalId,
      decidedBy: params.decidedBy,
      decision: params.decision,
    });
    await store.decideApproval({
      runId: run.runId,
      tenantId: run.tenantId,
      approvalId: params.approvalId,
      decidedBy: params.decidedBy,
      decision: params.decision,
      status: params.status,
      state,
      events: await this.sanitize([
        {
          type: 'approval.decided',
          actor: `user:${params.decidedBy}`,
          payload: { approvalId: params.approvalId, status: params.status, decision: params.decision },
        },
      ]),
    });
    return this.drive(run.runId);
  }

  /** Operator action: re-drives a run that failed with a transient error. */
  async resume(runId: string, tenantId: string, actor: string): Promise<RunRecord<S>> {
    const run = await this.d.store.getRun(runId, tenantId);
    if (!run) throw new DomainError('NOT_FOUND', 'run not found');
    if (run.status === 'running') return this.drive(runId);
    if (run.status !== 'failed' || !run.lastError || !RESUMABLE_ERRORS.has(run.lastError.code)) {
      throw new DomainError(
        'CONFLICT',
        `run in status ${run.status} (${run.lastError?.code ?? 'n/a'}) cannot be resumed`,
      );
    }
    await this.d.store.commitStep({
      runId,
      expectedVersion: run.version,
      status: 'running',
      currentStep: run.currentStep,
      state: run.state,
      usage: run.usage,
      lastError: null,
      checkpointStep: run.currentStep ?? START,
      events: [{ type: 'run.resumed', actor: `user:${actor}`, payload: { fromStep: run.currentStep } }],
    });
    return this.drive(runId);
  }

  /** Startup/periodic recovery: re-drive runs whose worker died mid-flight. */
  async recover(limit = 50): Promise<string[]> {
    const ids = await this.d.store.listRecoverable(limit);
    for (const id of ids) {
      this.d.logger.warn({ runId: id }, 'recovering run from last checkpoint');
      await this.drive(id);
    }
    return ids;
  }

  /** Enforces the "PII never reaches the audit sink" data policy on every event payload. */
  private async sanitize(events: AuditEventInput[]): Promise<AuditEventInput[]> {
    const out: AuditEventInput[] = [];
    const violations: AuditEventInput[] = [];
    for (const e of events) {
      const json = JSON.stringify(e.payload);
      const { text, findings } = await redactPii(json, maskReplacer);
      if (findings.length === 0) {
        out.push(e);
        continue;
      }
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { redacted: true };
      }
      out.push({ ...e, payload });
      // Human free text (e.g. approval comments) is expected to contain PII sometimes: redact
      // silently. Anything machine-generated containing PII is a real control failure.
      if (!e.actor.startsWith('user:')) {
        violations.push({
          type: 'policy.violation',
          actor: 'system:dlp',
          payload: {
            ruleId: this.d.gate.egressRuleId,
            sink: 'audit',
            eventType: e.type,
            kinds: [...new Set(findings.map((f) => f.kind))],
          },
        });
      }
    }
    return [...out, ...violations];
  }
}
