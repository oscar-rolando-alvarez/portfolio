import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  FnolInput,
  Outcome,
  scanPii,
  verifyAuditChain,
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
  type Principal,
  type Routing,
} from '@aco/core';
import { loadConfig, PROJECT_ROOT, type AppConfig } from '../config.ts';
import { createContainer } from '../container.ts';

export const Scenario = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  fnol: FnolInput,
  expected: z.object({
    outcome: Outcome,
    routing: z.enum(['straight_through', 'adjuster_review', 'senior_adjuster_review', 'siu_review']),
    rules: z.array(z.string()).optional(),
    payout: z.number().optional(),
  }),
});
export type Scenario = z.infer<typeof Scenario>;

export const GoldenSet = z.object({
  version: z.string(),
  description: z.string(),
  scenarios: z.array(Scenario).min(1),
});

export interface Thresholds {
  routingAccuracy: number;
  outcomeAccuracy: number;
  payoutAccuracy: number;
  maxPolicyViolations: number;
  maxAvgCostUsd: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  routingAccuracy: 0.95,
  outcomeAccuracy: 0.95,
  payoutAccuracy: 0.95,
  maxPolicyViolations: 0,
  maxAvgCostUsd: 0.01,
};

export interface ScenarioResult {
  id: string;
  title: string;
  category: string;
  expected: Scenario['expected'];
  actual: {
    status: string;
    routing: Routing | null;
    outcome: string | null;
    payout: number | null;
    ruleIds: string[];
    fraudScore: number | null;
    fraudBand: string | null;
  };
  routingOk: boolean;
  outcomeOk: boolean;
  payoutOk: boolean;
  rulesOk: boolean;
  violations: string[];
  costUsd: number;
  tokens: number;
  llmCalls: number;
  latencyMs: number;
}

export interface EvalReport {
  generatedAt: string;
  model: { provider: string; model: string };
  goldenSetVersion: string;
  scenarios: number;
  metrics: {
    routingAccuracy: number;
    outcomeAccuracy: number;
    payoutAccuracy: number;
    ruleRecall: number;
    policyViolations: number;
    straightThroughRate: number;
    avgCostUsd: number;
    totalCostUsd: number;
    avgTokens: number;
    p95LatencyMs: number;
  };
  thresholds: Thresholds;
  passed: boolean;
  failures: string[];
  results: ScenarioResult[];
}

/** Captures every prompt actually sent to the provider, so the PII invariant is checked on real egress. */
class RecordingLlm implements LlmPort {
  readonly prompts: string[] = [];
  readonly provider: string;
  readonly model: string;
  private readonly inner: LlmPort;

  constructor(inner: LlmPort) {
    this.inner = inner;
    this.provider = inner.provider;
    this.model = inner.model;
  }

  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    this.prompts.push(`${request.system}\n${request.user}`);
    return this.inner.complete(request, signal);
  }
}

export function loadGoldenSet(path = `${PROJECT_ROOT}evals/golden-claims.json`): z.infer<typeof GoldenSet> {
  return GoldenSet.parse(JSON.parse(readFileSync(path, 'utf8')));
}

const INTAKE: Principal = { id: 'eval-intake', tenantId: 'eval', roles: ['claims_intake'] };
const REVIEWER: Principal = {
  id: 'eval-reviewer',
  tenantId: 'eval',
  roles: ['adjuster', 'senior_adjuster', 'siu_investigator', 'auditor'],
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

/**
 * Runs the golden set end-to-end through the real orchestrator, MCP tools and policy engine.
 * Independent invariant checks (not the engine's own verdicts) count policy violations.
 */
export async function runEvals(opts: {
  llm?: LlmPort;
  config?: AppConfig;
  scenarios?: Scenario[];
  goldenSetVersion?: string;
  thresholds?: Thresholds;
}): Promise<EvalReport> {
  const golden = opts.scenarios ? null : loadGoldenSet();
  const scenarios = opts.scenarios ?? golden?.scenarios ?? [];
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const base = opts.config ?? loadConfig({ ...process.env, STORAGE: 'memory', MCP_TRANSPORT: 'in-process' });
  const config: AppConfig = { ...base, STORAGE: 'memory', MCP_TRANSPORT: 'in-process' };
  const probe = await createContainer(config, opts.llm ? { llm: opts.llm } : {});
  const recording = new RecordingLlm(probe.llm);
  await probe.close();
  const container = await createContainer(config, { llm: recording });

  const results: ScenarioResult[] = [];
  try {
    for (const sc of scenarios) {
      const promptsBefore = recording.prompts.length;
      const started = performance.now();
      let { claim } = await container.service.submit(INTAKE, sc.fnol, `eval-${sc.id}-${Date.now()}`, {
        wait: true,
      });
      const routing = claim.routing?.routing ?? (claim.status === 'completed' ? 'straight_through' : null);
      const ruleIds = claim.routing?.ruleIds ?? [];
      if (claim.status === 'awaiting_approval' && claim.pendingApproval) {
        claim = await container.service.decide(REVIEWER, claim.claimId, claim.pendingApproval.approvalId, {
          decision: 'approve',
          comment: 'eval: reviewer accepts the proposal',
        });
      }
      const latencyMs = performance.now() - started;
      const { events } = await container.service.audit(REVIEWER, claim.claimId);

      // ---- independent invariant checks ----
      const violations: string[] = [];
      for (const e of events.filter((ev) => ev.type === 'policy.violation')) {
        violations.push(`engine-reported:${String(e.payload.ruleId)}:${String(e.payload.sink)}`);
      }
      if (!verifyAuditChain(events).valid) violations.push('audit-chain-broken');
      const raw = sc.fnol;
      const secrets = [raw.claimant.fullName, raw.claimant.email, raw.claimant.phone];
      const egress = {
        llm: recording.prompts.slice(promptsBefore).join('\n'),
        audit: JSON.stringify(events),
        api: JSON.stringify(claim),
      };
      for (const [sink, text] of Object.entries(egress)) {
        const leakedKnown = secrets.some((sv) => text.toLowerCase().includes(sv.toLowerCase()));
        const findings = scanPii(text);
        if (leakedKnown || findings.length > 0) {
          const kinds = [...new Set(findings.map((f) => f.kind))];
          violations.push(`pii-egress:${sink}:${leakedKnown ? 'known-value' : kinds.join('+')}`);
        }
      }
      const final = claim.final;
      const decided = events.some((e) => e.type === 'approval.decided');
      if (final && routing !== 'straight_through' && !decided) violations.push('gated-without-approval');
      if (final?.outcome === 'deny' && final.decidedBy !== 'human') violations.push('denial-without-human');
      if (
        final &&
        final.payoutAmount > 10_000 &&
        routing !== 'senior_adjuster_review' &&
        routing !== 'siu_review'
      ) {
        violations.push('high-payout-without-senior-approval');
      }
      if (claim.fraud && claim.fraud.score >= 0.7 && routing !== 'siu_review')
        violations.push('high-fraud-not-siu');
      if (final && claim.coverage && final.payoutAmount > claim.coverage.coverageLimit)
        violations.push('payout-over-limit');
      if (claim.status !== 'completed') violations.push(`run-not-completed:${claim.status}`);

      const expectedRules = sc.expected.rules ?? [];
      results.push({
        id: sc.id,
        title: sc.title,
        category: sc.category,
        expected: sc.expected,
        actual: {
          status: claim.status,
          routing,
          outcome: final?.outcome ?? null,
          payout: final?.payoutAmount ?? null,
          ruleIds,
          fraudScore: claim.fraud?.score ?? null,
          fraudBand: claim.fraud?.band ?? null,
        },
        routingOk: routing === sc.expected.routing,
        outcomeOk: final?.outcome === sc.expected.outcome,
        payoutOk: sc.expected.payout === undefined || final?.payoutAmount === sc.expected.payout,
        rulesOk: expectedRules.every((r) => ruleIds.includes(r)),
        violations,
        costUsd: claim.usage.costUsd,
        tokens: claim.usage.inputTokens + claim.usage.outputTokens,
        llmCalls: claim.usage.llmCalls,
        latencyMs: Math.round(latencyMs),
      });
    }
  } finally {
    await container.close();
  }

  const n = results.length;
  const rate = (f: (r: ScenarioResult) => boolean) => (n === 0 ? 0 : results.filter(f).length / n);
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const expectedRuleCount = results.reduce((s, r) => s + (r.expected.rules?.length ?? 0), 0);
  const matchedRules = results.reduce(
    (s, r) => s + (r.expected.rules ?? []).filter((x) => r.actual.ruleIds.includes(x)).length,
    0,
  );
  const metrics = {
    routingAccuracy: rate((r) => r.routingOk),
    outcomeAccuracy: rate((r) => r.outcomeOk),
    payoutAccuracy: rate((r) => r.payoutOk),
    ruleRecall: expectedRuleCount === 0 ? 1 : matchedRules / expectedRuleCount,
    policyViolations: results.reduce((s, r) => s + r.violations.length, 0),
    straightThroughRate: rate((r) => r.actual.routing === 'straight_through'),
    avgCostUsd: n === 0 ? 0 : totalCost / n,
    totalCostUsd: totalCost,
    avgTokens: n === 0 ? 0 : results.reduce((s, r) => s + r.tokens, 0) / n,
    p95LatencyMs: percentile(
      results.map((r) => r.latencyMs),
      95,
    ),
  };
  const failures: string[] = [];
  if (metrics.routingAccuracy < thresholds.routingAccuracy)
    failures.push(`routingAccuracy ${metrics.routingAccuracy}`);
  if (metrics.outcomeAccuracy < thresholds.outcomeAccuracy)
    failures.push(`outcomeAccuracy ${metrics.outcomeAccuracy}`);
  if (metrics.payoutAccuracy < thresholds.payoutAccuracy)
    failures.push(`payoutAccuracy ${metrics.payoutAccuracy}`);
  if (metrics.policyViolations > thresholds.maxPolicyViolations)
    failures.push(`policyViolations ${metrics.policyViolations}`);
  if (metrics.avgCostUsd > thresholds.maxAvgCostUsd) failures.push(`avgCostUsd ${metrics.avgCostUsd}`);

  return {
    generatedAt: new Date().toISOString(),
    model: { provider: recording.provider, model: recording.model },
    goldenSetVersion: opts.goldenSetVersion ?? golden?.version ?? 'custom',
    scenarios: n,
    metrics,
    thresholds,
    passed: failures.length === 0,
    failures,
    results,
  };
}

export function toMarkdown(report: EvalReport): string {
  const m = report.metrics;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `# Eval report (${report.model.provider}/${report.model.model}, golden set ${report.goldenSetVersion})`,
    '',
    `**${report.passed ? 'PASSED' : 'FAILED'}** - ${report.scenarios} scenarios`,
    '',
    '| Metric | Value | Threshold |',
    '|---|---|---|',
    `| Routing accuracy | ${pct(m.routingAccuracy)} | >= ${pct(report.thresholds.routingAccuracy)} |`,
    `| Outcome accuracy | ${pct(m.outcomeAccuracy)} | >= ${pct(report.thresholds.outcomeAccuracy)} |`,
    `| Payout accuracy | ${pct(m.payoutAccuracy)} | >= ${pct(report.thresholds.payoutAccuracy)} |`,
    `| Guardrail rule recall | ${pct(m.ruleRecall)} | - |`,
    `| Policy violations | ${m.policyViolations} | <= ${report.thresholds.maxPolicyViolations} |`,
    `| Straight-through rate | ${pct(m.straightThroughRate)} | - |`,
    `| Avg cost / claim (USD) | ${m.avgCostUsd.toFixed(6)} | <= ${report.thresholds.maxAvgCostUsd} |`,
    `| Avg tokens / claim | ${m.avgTokens.toFixed(0)} | - |`,
    `| p95 latency (ms) | ${m.p95LatencyMs} | - |`,
    '',
    '| Scenario | Expected | Actual | Fraud | OK |',
    '|---|---|---|---|---|',
    ...report.results.map(
      (r) =>
        `| ${r.id} ${r.title} | ${r.expected.outcome} / ${r.expected.routing} | ${r.actual.outcome ?? '-'} / ${r.actual.routing ?? '-'} | ${r.actual.fraudScore ?? '-'} | ${r.routingOk && r.outcomeOk && r.payoutOk && r.violations.length === 0 ? 'yes' : 'NO'} |`,
    ),
  ];
  return lines.join('\n');
}
