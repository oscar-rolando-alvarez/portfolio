import type { ClaimState, FinalDecision } from '../domain/claim.ts';
import { DomainError } from '../domain/errors.ts';
import type { StepDefinition } from '../runtime/graph.ts';

/**
 * System step: materializes the final decision (system proposal or human override).
 * In production this is where the payment/notification/claims-admin integrations would be
 * invoked with the run's idempotency key.
 */
export const finalizeStep: StepDefinition<ClaimState> = {
  name: 'finalize',
  kind: 'system',
  description: 'Applies the human review (if any) and records the final decision.',
  timeoutMs: 10_000,
  execute(state, ctx) {
    const decision = state.decision;
    if (!decision) throw new DomainError('VALIDATION_FAILED', 'cannot finalize without a decision');
    const review = state.review;
    const override = review?.decision === 'override' ? review : null;
    const final: FinalDecision = {
      outcome: override?.overrideOutcome ?? decision.outcome,
      payoutAmount: override?.overridePayout ?? decision.payoutAmount,
      decidedBy: review ? 'human' : 'system',
      routing: state.routing?.routing ?? 'straight_through',
      policyVersion: state.routing?.policyVersion ?? null,
    };
    if (final.outcome !== 'approve') final.payoutAmount = 0;
    ctx.emit({
      type: 'claim.finalized',
      payload: {
        outcome: final.outcome,
        payoutAmount: final.payoutAmount,
        decidedBy: final.decidedBy,
        routing: final.routing,
        reviewedBy: review?.decidedBy ?? null,
      },
    });
    return Promise.resolve({ ...state, final });
  },
};
