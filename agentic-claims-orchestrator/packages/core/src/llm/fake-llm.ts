import { TransientError } from '../domain/errors.ts';
import { extractFacts, looksLikeInjection } from '../agents/prompts.ts';
import { ruleBasedSeverity } from '../agents/intake.ts';
import { estimateTokens, type LlmPort, type LlmRequest, type LlmResponse } from './types.ts';

export interface FakeLlmOptions {
  /** Tasks that throw a transient error (first N calls if `failTimes` is set). */
  failTasks?: string[];
  failTimes?: number;
  /** Tasks that return malformed output (exercise schema-validation fallbacks). */
  malformedTasks?: string[];
  latencyMs?: number;
}

/**
 * Deterministic offline LLM used by tests, the eval CI gate and the demo. It reads the
 * <facts> block of each prompt and produces stable, realistic outputs per task, with
 * token usage estimated from the prompt length so cost accounting is exercised end-to-end.
 */
export class FakeLlm implements LlmPort {
  readonly provider = 'fake';
  readonly model = 'fake-claims-llm-1';
  readonly calls: LlmRequest[] = [];
  private readonly opts: FakeLlmOptions;
  private failures = 0;

  constructor(opts: FakeLlmOptions = {}) {
    this.opts = opts;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    this.calls.push(request);
    if (this.opts.latencyMs) {
      await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    }
    signal?.throwIfAborted();
    if (this.opts.failTasks?.includes(request.task)) {
      if (this.opts.failTimes === undefined || this.failures < this.opts.failTimes) {
        this.failures += 1;
        throw new TransientError(`fake provider unavailable for ${request.task}`);
      }
    }
    const text = this.opts.malformedTasks?.includes(request.task) ? 'not json at all' : this.respond(request);
    return {
      text,
      model: this.model,
      finishReason: 'stop',
      usage: {
        inputTokens: estimateTokens(request.system + request.user),
        outputTokens: estimateTokens(text),
      },
    };
  }

  private respond(request: LlmRequest): string {
    const facts = extractFacts(request.user);
    switch (request.task) {
      case 'intake.classify': {
        const description =
          /<untrusted_claim_description>([\s\S]*?)<\/untrusted_claim_description>/.exec(request.user)?.[1] ??
          '';
        const amount = typeof facts.claimedAmount === 'number' ? facts.claimedAmount : 0;
        const docs = Array.isArray(facts.documents) ? facts.documents.length : 0;
        return JSON.stringify({
          severity: ruleBasedSeverity(amount),
          summary: `${String(facts.lossType)} loss on a ${String(facts.lineOfBusiness)} policy; claimed ${amount.toFixed(2)} USD with ${docs} supporting document(s).`,
          injectionSuspected: looksLikeInjection(description),
        });
      }
      case 'fraud.rationale': {
        const factors = Array.isArray(facts.topFactors)
          ? (facts.topFactors as { label?: string; contribution?: number }[])
          : [];
        const up = factors.filter((f) => (f.contribution ?? 0) > 0).map((f) => f.label ?? 'unknown');
        const score = typeof facts.score === 'number' ? (facts.score * 100).toFixed(1) : '?';
        return up.length > 0
          ? `The model estimates a ${score}% fraud likelihood (${String(facts.band)} band). Risk is driven mainly by ${up.slice(0, 3).join(', ')}. This is a statistical indicator, not evidence of fraud.`
          : `The model estimates a ${score}% fraud likelihood (${String(facts.band)} band); no factor raises risk above the portfolio baseline.`;
      }
      case 'decision.summary': {
        const reasons = Array.isArray(facts.reasons) ? facts.reasons.join(', ') : '';
        const payout = typeof facts.payoutAmount === 'number' ? facts.payoutAmount.toFixed(2) : '0.00';
        return `Proposed outcome: ${String(facts.outcome)} (payout ${payout} USD). Basis: ${reasons}. Fraud band: ${typeof facts.fraudBand === 'string' ? facts.fraudBand : 'n/a'}. Proposal is subject to policy review before release.`;
      }
      default:
        return JSON.stringify({ ok: true });
    }
  }
}
