import type { ClaimState, DecisionResult, Outcome } from '../domain/claim.ts';
import { completeText } from '../llm/structured.ts';
import type { StepDefinition } from '../runtime/graph.ts';
import { decisionSummaryPrompt } from './prompts.ts';
import { formatUsd } from './util.ts';

/** Deterministic outcome proposal; the policy engine decides afterwards whether a human must sign off. */
export function proposeOutcome(state: ClaimState): {
  outcome: Outcome;
  payoutAmount: number;
  reasons: string[];
} {
  const coverage = state.coverage;
  if (!coverage?.covered) {
    return { outcome: 'deny', payoutAmount: 0, reasons: coverage?.reasons ?? ['COVERAGE_NOT_EVALUATED'] };
  }
  if (state.fraud?.band === 'high') {
    return { outcome: 'refer_siu', payoutAmount: 0, reasons: ['FRAUD_RISK_HIGH'] };
  }
  if (coverage.payableAmount <= 0) {
    return { outcome: 'deny', payoutAmount: 0, reasons: ['BELOW_DEDUCTIBLE'] };
  }
  const reasons = ['COVERED'];
  if (state.extraction?.consistency === 'discrepancy') reasons.push('PAYOUT_LIMITED_TO_DOCUMENTED_AMOUNT');
  return { outcome: 'approve', payoutAmount: coverage.payableAmount, reasons };
}

export function templateSummary(
  state: ClaimState,
  p: { outcome: Outcome; payoutAmount: number; reasons: string[] },
): string {
  const what =
    p.outcome === 'approve'
      ? `Proposed approval with payout ${formatUsd(p.payoutAmount)}`
      : p.outcome === 'deny'
        ? 'Proposed denial'
        : 'Proposed referral to the Special Investigations Unit';
  const fraud = state.fraud
    ? ` Fraud risk ${state.fraud.band} (${(state.fraud.score * 100).toFixed(1)}%).`
    : '';
  return `${what}. Reasons: ${p.reasons.join(', ')}.${fraud} Subject to policy review.`;
}

export const decisionAgent: StepDefinition<ClaimState> = {
  name: 'decision',
  kind: 'agent',
  description: 'Proposes an outcome (approve/deny/refer_siu) and drafts the adjuster note.',
  timeoutMs: 20_000,
  async execute(state, ctx) {
    const proposal = proposeOutcome(state);
    const { system, user } = decisionSummaryPrompt({
      outcome: proposal.outcome,
      payoutAmount: proposal.payoutAmount,
      reasons: proposal.reasons,
      severity: state.intake?.severity,
      fraudBand: state.fraud?.band ?? null,
      fraudScore: state.fraud?.score ?? null,
      coverage: state.coverage
        ? { limit: state.coverage.coverageLimit, deductible: state.coverage.deductible }
        : null,
    });
    const summary = await completeText(
      ctx.llm,
      { task: 'decision.summary', system, user, maxOutputTokens: 200, temperature: 0 },
      () => templateSummary(state, proposal),
      { maxChars: 700, signal: ctx.signal },
    );
    const decision: DecisionResult = { ...proposal, summary: summary.text, summaryBy: summary.by };
    ctx.emit({
      type: 'decision.proposed',
      payload: { outcome: decision.outcome, payoutAmount: decision.payoutAmount, reasons: decision.reasons },
    });
    return { ...state, decision };
  },
};
