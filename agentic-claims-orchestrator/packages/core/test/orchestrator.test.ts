import { describe, expect, it } from 'vitest';
import {
  DomainError,
  END,
  FakeLlm,
  Graph,
  InMemoryRunStore,
  Orchestrator,
  TransientError,
  verifyAuditChain,
  type Clock,
  type Gate,
  type GateVerdict,
  type RunBudget,
  type RunStore,
  type StepCommit,
  type ToolGateway,
} from '../src/index.ts';

interface S {
  log: string[];
  approvedBy?: string;
}

class MutableClock implements Clock {
  t = Date.parse('2026-10-17T10:00:00Z');
  now(): Date {
    return new Date(this.t);
  }
}

function stubTools(behaviour: { failTimes?: number; error?: () => Error } = {}) {
  const calls: string[] = [];
  let failures = 0;
  const gateway: ToolGateway = {
    call: (name) => {
      calls.push(name);
      if (behaviour.failTimes !== undefined && failures < behaviour.failTimes) {
        failures += 1;
        return Promise.reject(behaviour.error?.() ?? new TransientError('tool blip'));
      }
      return Promise.resolve({ found: true, policy: null } as never);
    },
  };
  return { gateway, calls };
}

function allowVerdict(): GateVerdict {
  return { effect: 'allow', matched: [], requiredRole: null, policyId: 'p', policyVersion: '1' };
}

function gate(
  opts: { approveAfter?: string; blockAfter?: string; tools?: Record<string, string[]> } = {},
): Gate<S> {
  return {
    policyVersion: '1',
    egressRuleId: 'DP-PII-NO-EGRESS',
    allowedTools: (stage) => opts.tools?.[stage] ?? ['policy_lookup'],
    evaluate: (stage) => {
      if (stage === opts.blockAfter) {
        return {
          ...allowVerdict(),
          effect: 'block',
          matched: [{ ruleId: 'BLOCK-X', effect: 'block', role: null, description: 'x' }],
        };
      }
      if (stage === opts.approveAfter) {
        return {
          ...allowVerdict(),
          effect: 'require_approval',
          requiredRole: 'adjuster',
          matched: [
            { ruleId: 'HITL-X', effect: 'require_approval', role: 'adjuster', description: 'needs review' },
          ],
        };
      }
      return allowVerdict();
    },
  };
}

function graph(overrides: { slowStep?: string; llmInStep?: string; prompt?: string } = {}) {
  const step = (name: string) => ({
    name,
    kind: 'agent' as const,
    description: `step ${name}`,
    timeoutMs: 200,
    async execute(state: S, ctx: Parameters<Graph<S>['def']['steps'][string]['execute']>[1]) {
      if (overrides.slowStep === name) await new Promise((r) => setTimeout(r, 1_000));
      await ctx.tools.call('policy_lookup', { policyNumber: 'POL-100001' });
      if (overrides.llmInStep === name) {
        await ctx.llm.complete({ task: 'test', system: 'sys', user: overrides.prompt ?? 'hello' });
      }
      ctx.emit({ type: `${name}.done`, payload: {} });
      return { ...state, log: [...state.log, name] };
    },
  });
  return new Graph<S>({
    id: 'test-graph',
    version: '1',
    entry: 'a',
    steps: { a: step('a'), b: step('b'), c: step('c') },
    edges: { a: 'b', b: 'c', c: END },
    applyHumanDecision: (state, approval) => ({ ...state, approvedBy: approval.decidedBy }),
  });
}

function setup(
  opts: {
    tools?: ToolGateway;
    gate?: Gate<S>;
    graph?: Graph<S>;
    budget?: Partial<RunBudget>;
    store?: RunStore<S>;
    clock?: MutableClock;
    instanceId?: string;
    llm?: FakeLlm;
  } = {},
) {
  const clock = opts.clock ?? new MutableClock();
  const store = opts.store ?? new InMemoryRunStore<S>(clock);
  const llm = opts.llm ?? new FakeLlm();
  const orchestrator = new Orchestrator<S>({
    graph: opts.graph ?? graph(),
    store,
    gate: opts.gate ?? gate(),
    llm,
    tools: opts.tools ?? stubTools().gateway,
    pricing: { inputPerMTok: 1, outputPerMTok: 2 },
    budget: {
      maxIterations: 20,
      maxLlmTokens: 10_000,
      maxCostUsd: 1,
      maxToolCalls: 20,
      maxWallClockMs: 60_000,
      ...opts.budget,
    },
    clock,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
    leaseTtlMs: 30_000,
    instanceId: opts.instanceId ?? 'worker-1',
  });
  const start = (key = 'key-00000001') =>
    orchestrator.start({
      tenantId: 't1',
      idempotencyKey: key,
      actor: 'user:tester',
      initialState: () => ({ log: [] }),
    });
  return { orchestrator, store, clock, start, llm };
}

describe('Orchestrator', () => {
  it('runs the graph to completion with a checkpoint and audit events per step', async () => {
    const { orchestrator, store, start } = setup();
    const { run } = await start();
    const done = await orchestrator.drive(run.runId);
    expect(done.status).toBe('completed');
    expect(done.state.log).toEqual(['a', 'b', 'c']);
    expect(done.usage).toMatchObject({ iterations: 3, toolCalls: 3, retries: 0 });
    const cps = await store.listCheckpoints(run.runId);
    expect(cps.map((c) => c.step)).toEqual(['__start__', 'a', 'b', 'c']);
    const events = await store.listEvents(run.runId);
    expect(events.map((e) => e.type)).toEqual([
      'run.created',
      'tool.called',
      'a.done',
      'step.completed',
      'tool.called',
      'b.done',
      'step.completed',
      'tool.called',
      'c.done',
      'step.completed',
      'run.completed',
    ]);
    expect(verifyAuditChain(events).valid).toBe(true);
  });

  it('is idempotent on start', async () => {
    const { start } = setup();
    const first = await start('same-key-123');
    const second = await start('same-key-123');
    expect(second.created).toBe(false);
    expect(second.run.runId).toBe(first.run.runId);
  });

  it('retries transient tool failures with backoff and records each failed attempt', async () => {
    const tools = stubTools({ failTimes: 2 });
    const { orchestrator, store, start } = setup({ tools: tools.gateway });
    const { run } = await start();
    const done = await orchestrator.drive(run.runId);
    expect(done.status).toBe('completed');
    expect(done.usage.retries).toBe(2);
    expect(done.usage.iterations).toBe(5);
    const failed = (await store.listEvents(run.runId)).filter((e) => e.type === 'step.attempt_failed');
    expect(failed).toHaveLength(2);
    expect(failed[0]?.payload).toMatchObject({ step: 'a', attempt: 1, code: 'TRANSIENT', willRetry: true });
  });

  it('fails fast on non-retryable errors and can be resumed by an operator once the cause is fixed', async () => {
    let broken = true;
    const tools: ToolGateway = {
      call: () =>
        broken
          ? Promise.reject(new TransientError('dependency down'))
          : Promise.resolve({ found: true } as never),
    };
    const { orchestrator, start } = setup({ tools });
    const { run } = await start();
    const failed = await orchestrator.drive(run.runId);
    expect(failed.status).toBe('failed');
    expect(failed.lastError?.code).toBe('TRANSIENT');
    expect(failed.currentStep).toBe('a');

    broken = false;
    const resumed = await orchestrator.resume(run.runId, 't1', 'ops');
    expect(resumed.status).toBe('completed');
  });

  it('does not resume runs that failed for policy or budget reasons', async () => {
    const { orchestrator, start } = setup({ gate: gate({ blockAfter: 'b' }) });
    const { run } = await start();
    const failed = await orchestrator.drive(run.runId);
    expect(failed.lastError?.code).toBe('POLICY_BLOCKED');
    await expect(orchestrator.resume(run.runId, 't1', 'ops')).rejects.toThrow(/cannot be resumed/);
  });

  it('times out slow steps', async () => {
    const { orchestrator, start } = setup({ graph: graph({ slowStep: 'b' }) });
    const { run } = await start();
    const failed = await orchestrator.drive(run.runId);
    expect(failed).toMatchObject({ status: 'failed', currentStep: 'b' });
    expect(failed.lastError?.code).toBe('TIMEOUT');
    expect(failed.usage.retries).toBe(2);
  });

  it('enforces the iteration budget (fail safe)', async () => {
    const { orchestrator, start } = setup({ budget: { maxIterations: 2 } });
    const { run } = await start();
    const failed = await orchestrator.drive(run.runId);
    expect(failed.status).toBe('failed');
    expect(failed.lastError?.code).toBe('BUDGET_EXCEEDED');
    expect(failed.state.log).toEqual(['a', 'b']);
  });

  it('enforces the LLM token budget before calling the provider', async () => {
    const llm = new FakeLlm();
    const { orchestrator, start } = setup({
      graph: graph({ llmInStep: 'a' }),
      budget: { maxLlmTokens: 100 },
      llm,
    });
    const { run } = await start();
    const failed = await orchestrator.drive(run.runId);
    expect(failed.lastError?.code).toBe('BUDGET_EXCEEDED');
    expect(llm.calls).toHaveLength(0);
  });

  it('meters LLM usage and cost into the run', async () => {
    const { orchestrator, start } = setup({ graph: graph({ llmInStep: 'b' }) });
    const { run } = await start();
    const done = await orchestrator.drive(run.runId);
    expect(done.usage.llmCalls).toBe(1);
    expect(done.usage.inputTokens).toBeGreaterThan(0);
    expect(done.usage.costUsd).toBeGreaterThan(0);
  });

  it('blocks tools that are not granted to the step (least privilege)', async () => {
    const { orchestrator, store, start } = setup({ gate: gate({ tools: { a: ['policy_lookup'], b: [] } }) });
    const { run } = await start();
    const failed = await orchestrator.drive(run.runId);
    expect(failed).toMatchObject({ status: 'failed', currentStep: 'b' });
    expect(failed.lastError?.code).toBe('POLICY_BLOCKED');
    const violations = (await store.listEvents(run.runId)).filter((e) => e.type === 'policy.violation');
    expect(violations[0]?.payload).toMatchObject({ ruleId: 'TOOL-GRANT', tool: 'policy_lookup' });
  });

  it('redacts PII leaking into a prompt and records a DLP violation', async () => {
    const llm = new FakeLlm();
    const { orchestrator, store, start } = setup({
      graph: graph({ llmInStep: 'a', prompt: 'customer email is jane.roe@example.com' }),
      llm,
    });
    const { run } = await start();
    await orchestrator.drive(run.runId);
    expect(llm.calls[0]?.user).toBe('customer email is [REDACTED:EMAIL]');
    const v = (await store.listEvents(run.runId)).find((e) => e.type === 'policy.violation');
    expect(v?.payload).toMatchObject({ ruleId: 'DP-PII-NO-EGRESS', sink: 'llm', kinds: ['email'] });
  });

  it('pauses for human approval, then resumes idempotently', async () => {
    const { orchestrator, store, start } = setup({ gate: gate({ approveAfter: 'b' }) });
    const { run } = await start();
    const paused = await orchestrator.drive(run.runId);
    expect(paused).toMatchObject({ status: 'awaiting_approval', currentStep: 'c' });
    const [approval] = await store.listApprovals({ tenantId: 't1', status: 'pending' });
    expect(approval).toMatchObject({ requiredRole: 'adjuster', ruleIds: ['HITL-X'] });
    if (!approval) throw new Error('no approval');

    const params = {
      tenantId: 't1',
      runId: run.runId,
      approvalId: approval.approvalId,
      decidedBy: 'adj-1',
      decision: { decision: 'approve' },
      status: 'approved' as const,
    };
    const done = await orchestrator.decide(params);
    expect(done.status).toBe('completed');
    expect(done.state.approvedBy).toBe('adj-1');
    // replaying the same decision is a no-op; a different one is a conflict
    expect((await orchestrator.decide(params)).status).toBe('completed');
    await expect(orchestrator.decide({ ...params, decidedBy: 'adj-2' })).rejects.toThrow(/already/);
  });

  it('only lets one worker drive a run at a time (lease)', async () => {
    const clock = new MutableClock();
    const store = new InMemoryRunStore<S>(clock);
    const a = setup({ store, clock, instanceId: 'w-a' });
    const b = setup({ store, clock, instanceId: 'w-b' });
    const { run } = await a.start();
    await store.acquireLease(run.runId, 'w-a', 30_000);
    const fromB = await b.orchestrator.drive(run.runId);
    expect(fromB.status).toBe('running');
    expect(fromB.state.log).toEqual([]);
  });

  it('recovers a crashed run from its last checkpoint without re-executing completed steps', async () => {
    const clock = new MutableClock();
    const inner = new InMemoryRunStore<S>(clock);
    let crashOn: string | null = 'b';
    // Simulates the process dying while committing step "b" (nothing for "b" is persisted).
    const crashingStore: RunStore<S> = Object.assign(Object.create(inner) as RunStore<S>, {
      commitStep: (c: StepCommit<S>) => {
        if (c.checkpointStep === crashOn) {
          crashOn = null;
          return Promise.reject(new Error('process killed'));
        }
        return inner.commitStep(c);
      },
    });
    const tools = stubTools();
    const w1 = setup({ store: crashingStore, clock, instanceId: 'w-1', tools: tools.gateway });
    const { run } = await w1.start();
    await store_lease_left_behind(inner, run.runId, 'w-1');
    await expect(w1.orchestrator.drive(run.runId)).rejects.toThrow('process killed');
    await inner.acquireLease(run.runId, 'w-1', 30_000); // the dead worker's lease is still there
    expect((await inner.getRun(run.runId))?.state.log).toEqual(['a']);

    const w2 = setup({ store: inner, clock, instanceId: 'w-2', tools: tools.gateway });
    expect(await w2.orchestrator.recover()).toEqual([]); // lease not expired yet
    clock.t += 31_000;
    expect(await w2.orchestrator.recover()).toEqual([run.runId]);
    const done = await inner.getRun(run.runId);
    expect(done?.status).toBe('completed');
    expect(done?.state.log).toEqual(['a', 'b', 'c']);
    // a: once; b: crashed attempt + re-execution; c: once
    expect(tools.calls).toHaveLength(4);
  });

  it('rejects decisions on unknown approvals', async () => {
    const { orchestrator, start } = setup();
    const { run } = await start();
    await expect(
      orchestrator.decide({
        tenantId: 't1',
        runId: run.runId,
        approvalId: 'nope',
        decidedBy: 'x',
        decision: {},
        status: 'approved',
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

async function store_lease_left_behind(
  store: InMemoryRunStore<S>,
  runId: string,
  owner: string,
): Promise<void> {
  await store.acquireLease(runId, owner, 30_000);
  await store.releaseLease(runId, owner);
}
