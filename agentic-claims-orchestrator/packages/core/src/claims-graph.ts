import { z } from 'zod';
import { coverageAgent } from './agents/coverage.ts';
import { decisionAgent } from './agents/decision.ts';
import { extractionAgent } from './agents/extraction.ts';
import { finalizeStep } from './agents/finalize.ts';
import { createFraudRiskAgent } from './agents/fraud-risk.ts';
import { intakeAgent } from './agents/intake.ts';
import { Outcome, ReviewerRole, routingForRole, type ClaimState } from './domain/claim.ts';
import { DomainError } from './domain/errors.ts';
import { FraudModel } from './ml/fraud-model.ts';
import { END, Graph } from './runtime/graph.ts';

export const HumanDecision = z.discriminatedUnion('decision', [
  z.strictObject({
    decision: z.literal('approve'),
    comment: z.string().max(2_000).optional(),
  }),
  z
    .strictObject({
      decision: z.literal('override'),
      outcome: Outcome,
      payoutAmount: z.number().nonnegative().optional(),
      comment: z.string().min(10, 'an override requires a justification (>= 10 chars)').max(2_000),
    })
    .refine((d) => d.outcome !== 'approve' || d.payoutAmount !== undefined, {
      message: 'payoutAmount is required when overriding to approve',
      path: ['payoutAmount'],
    }),
]);
export type HumanDecision = z.infer<typeof HumanDecision>;

export const CLAIMS_GRAPH_ID = 'claims-triage';
export const CLAIMS_GRAPH_VERSION = '1.0.0';

/**
 * The claims triage graph:
 *   intake -> extraction -> coverage -(covered)-> fraudRisk -> decision -> [policy gate] -> finalize
 *                                    \-(not covered)----------^
 */
export function createClaimsGraph(model: FraudModel = new FraudModel()): Graph<ClaimState> {
  return new Graph<ClaimState>({
    id: CLAIMS_GRAPH_ID,
    version: CLAIMS_GRAPH_VERSION,
    entry: 'intake',
    steps: {
      intake: intakeAgent,
      extraction: extractionAgent,
      coverage: coverageAgent,
      fraudRisk: createFraudRiskAgent(model),
      decision: decisionAgent,
      finalize: finalizeStep,
    },
    edges: {
      intake: 'extraction',
      extraction: 'coverage',
      coverage: (s) => (s.coverage?.covered ? 'fraudRisk' : 'decision'),
      fraudRisk: 'decision',
      decision: 'finalize',
      finalize: END,
    },
    annotateVerdict(state, stage, verdict) {
      if (stage !== 'decision') return state;
      const role = verdict.requiredRole === null ? null : ReviewerRole.parse(verdict.requiredRole);
      return {
        ...state,
        routing: {
          routing: routingForRole(role),
          ruleIds: verdict.matched.map((m) => m.ruleId),
          policyVersion: verdict.policyVersion,
        },
      };
    },
    applyHumanDecision(state, approval) {
      const parsed = HumanDecision.safeParse(approval.decision);
      if (!parsed.success) {
        throw new DomainError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'invalid decision');
      }
      const d = parsed.data;
      const role = ReviewerRole.parse(
        state.routing?.routing === 'siu_review'
          ? 'siu_investigator'
          : state.routing?.routing === 'senior_adjuster_review'
            ? 'senior_adjuster'
            : 'adjuster',
      );
      return {
        ...state,
        review: {
          approvalId: approval.approvalId,
          requiredRole: role,
          ruleIds: state.routing?.ruleIds ?? [],
          decision: d.decision,
          decidedBy: approval.decidedBy,
          comment: d.comment ?? null,
          overrideOutcome: d.decision === 'override' ? d.outcome : null,
          overridePayout: d.decision === 'override' ? (d.payoutAmount ?? null) : null,
        },
      };
    },
  });
}
