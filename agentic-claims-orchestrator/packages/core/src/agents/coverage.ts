import type { ClaimState, CoverageReason, CoverageResult, TokenizedFnol } from '../domain/claim.ts';
import type { StepDefinition } from '../runtime/graph.ts';
import type { PolicyRecord } from '../tools/contracts.ts';
import { round2 } from './util.ts';

/** Deterministic coverage evaluation — a pure function, unit-tested exhaustively. */
export function evaluateCoverage(
  fnol: TokenizedFnol,
  policy: PolicyRecord | null,
  documentedAmount: number | null,
): CoverageResult {
  const assessedAmount = round2(
    documentedAmount === null ? fnol.claimedAmount : Math.min(fnol.claimedAmount, documentedAmount),
  );
  if (!policy) {
    return {
      policyFound: false,
      covered: false,
      reasons: ['POLICY_NOT_FOUND'],
      exclusionMatched: null,
      policyStartDate: null,
      coverageLimit: 0,
      deductible: 0,
      assessedAmount,
      payableAmount: 0,
    };
  }
  const reasons: CoverageReason[] = [];
  if (policy.status !== 'active') reasons.push('POLICY_INACTIVE');
  if (fnol.lossDate < policy.startDate || fnol.lossDate > policy.endDate)
    reasons.push('LOSS_OUTSIDE_POLICY_PERIOD');
  if (policy.lineOfBusiness !== fnol.lineOfBusiness) reasons.push('LINE_OF_BUSINESS_MISMATCH');
  if (!policy.coveredPerils.includes(fnol.lossType)) reasons.push('PERIL_NOT_COVERED');
  const description = fnol.description.toLowerCase();
  const exclusionMatched = policy.exclusions.find((e) => description.includes(e.toLowerCase())) ?? null;
  if (exclusionMatched) reasons.push('EXCLUSION_APPLIES');

  const covered = reasons.length === 0;
  const payableAmount = covered
    ? round2(Math.max(0, Math.min(assessedAmount, policy.coverageLimit) - policy.deductible))
    : 0;
  return {
    policyFound: true,
    covered,
    reasons: covered ? ['COVERED'] : reasons,
    exclusionMatched,
    policyStartDate: policy.startDate,
    coverageLimit: policy.coverageLimit,
    deductible: policy.deductible,
    assessedAmount,
    payableAmount,
  };
}

/** Coverage agent: fetches the policy via MCP and evaluates coverage, limits and deductible. */
export const coverageAgent: StepDefinition<ClaimState> = {
  name: 'coverage',
  kind: 'agent',
  description:
    'Verifies policy status, period, peril and exclusions via policy_lookup; computes payable amount.',
  timeoutMs: 20_000,
  async execute(state, ctx) {
    const res = await ctx.tools.call(
      'policy_lookup',
      { policyNumber: state.input.policyNumber },
      { signal: ctx.signal },
    );
    const coverage = evaluateCoverage(state.input, res.policy, state.extraction?.documentedAmount ?? null);
    ctx.emit({
      type: 'coverage.evaluated',
      payload: {
        covered: coverage.covered,
        reasons: coverage.reasons,
        payableAmount: coverage.payableAmount,
        coverageLimit: coverage.coverageLimit,
        deductible: coverage.deductible,
      },
    });
    return { ...state, coverage };
  },
};
