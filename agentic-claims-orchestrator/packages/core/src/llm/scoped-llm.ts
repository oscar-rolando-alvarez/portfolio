import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { BudgetExceededError, DomainError } from '../domain/errors.ts';
import { maskReplacer, redactPii } from '../privacy/dlp.ts';
import { claimMetrics } from '../telemetry/metrics.ts';
import { Claims, GenAi, tracer } from '../telemetry/semconv.ts';
import type { RunBudget } from '../runtime/budget.ts';
import type { Usage } from '../runtime/types.ts';
import {
  costOf,
  estimateTokens,
  type LlmPort,
  type LlmPricing,
  type LlmRequest,
  type LlmResponse,
} from './types.ts';

export interface UsageMeter {
  /** Usage of the run before this step started. */
  readonly base: Usage;
  /** Usage accumulated by the current step attempt. */
  delta: Partial<Usage>;
}

export interface EgressViolation {
  ruleId: string;
  sink: 'llm';
  kinds: string[];
  task: string;
}

/**
 * Step-scoped LLM decorator applying, in order: DLP egress guard -> pre-flight budget check
 * -> GenAI-semconv tracing -> provider call -> usage/cost metering.
 */
export class ScopedLlm implements LlmPort {
  readonly provider: string;
  readonly model: string;
  private readonly inner: LlmPort;
  private readonly opts: {
    pricing: LlmPricing;
    budget: RunBudget;
    meter: UsageMeter;
    runId: string;
    step: string;
    egressRuleId: string;
    onEgressViolation: (v: EgressViolation) => void;
  };

  constructor(
    inner: LlmPort,
    opts: {
      pricing: LlmPricing;
      budget: RunBudget;
      meter: UsageMeter;
      runId: string;
      step: string;
      egressRuleId: string;
      onEgressViolation: (v: EgressViolation) => void;
    },
  ) {
    this.inner = inner;
    this.opts = opts;
    this.provider = inner.provider;
    this.model = inner.model;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const { meter, budget } = this.opts;

    // 1) DLP egress guard (defense in depth — inputs should already be tokenized).
    const sys = await redactPii(request.system, maskReplacer);
    const usr = await redactPii(request.user, maskReplacer);
    const findings = [...sys.findings, ...usr.findings];
    if (findings.length > 0) {
      claimMetrics().policyViolations.add(1, { rule: this.opts.egressRuleId, sink: 'llm' });
      this.opts.onEgressViolation({
        ruleId: this.opts.egressRuleId,
        sink: 'llm',
        kinds: [...new Set(findings.map((f) => f.kind))],
        task: request.task,
      });
    }
    const safe: LlmRequest = { ...request, system: sys.text, user: usr.text };

    // 2) Pre-flight budget check with a conservative estimate.
    const used =
      meter.base.inputTokens +
      meter.base.outputTokens +
      (meter.delta.inputTokens ?? 0) +
      (meter.delta.outputTokens ?? 0);
    const estimate = estimateTokens(safe.system + safe.user) + (safe.maxOutputTokens ?? 512);
    if (used + estimate > budget.maxLlmTokens) {
      throw new BudgetExceededError('llm_tokens', budget.maxLlmTokens, used + estimate);
    }
    const spent = meter.base.costUsd + (meter.delta.costUsd ?? 0);
    if (spent > budget.maxCostUsd) throw new BudgetExceededError('cost_usd', budget.maxCostUsd, spent);

    // 3) Traced provider call.
    const started = performance.now();
    return tracer().startActiveSpan(
      `chat ${this.model}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          [GenAi.OPERATION_NAME]: 'chat',
          [GenAi.PROVIDER_NAME]: this.provider,
          [GenAi.REQUEST_MODEL]: this.model,
          [GenAi.REQUEST_MAX_TOKENS]: safe.maxOutputTokens ?? 512,
          [GenAi.REQUEST_TEMPERATURE]: safe.temperature ?? 0,
          [GenAi.OUTPUT_TYPE]: safe.json ? 'json' : 'text',
          [GenAi.CONVERSATION_ID]: this.opts.runId,
          [Claims.RUN_ID]: this.opts.runId,
          [Claims.STEP]: this.opts.step,
          [Claims.LLM_TASK]: safe.task,
        },
      },
      async (span) => {
        const metricAttrs = {
          [GenAi.OPERATION_NAME]: 'chat',
          [GenAi.PROVIDER_NAME]: this.provider,
          [GenAi.REQUEST_MODEL]: this.model,
        };
        try {
          const res = await this.inner.complete(safe, signal);
          const cost = costOf(res.usage, this.opts.pricing);
          meter.delta = {
            ...meter.delta,
            llmCalls: (meter.delta.llmCalls ?? 0) + 1,
            inputTokens: (meter.delta.inputTokens ?? 0) + res.usage.inputTokens,
            outputTokens: (meter.delta.outputTokens ?? 0) + res.usage.outputTokens,
            costUsd: (meter.delta.costUsd ?? 0) + cost,
          };
          span.setAttributes({
            [GenAi.RESPONSE_MODEL]: res.model,
            [GenAi.RESPONSE_FINISH_REASONS]: [res.finishReason],
            [GenAi.USAGE_INPUT_TOKENS]: res.usage.inputTokens,
            [GenAi.USAGE_OUTPUT_TOKENS]: res.usage.outputTokens,
            [Claims.COST_USD]: cost,
          });
          const m = claimMetrics();
          m.tokenUsage.record(res.usage.inputTokens, { ...metricAttrs, 'gen_ai.token.type': 'input' });
          m.tokenUsage.record(res.usage.outputTokens, { ...metricAttrs, 'gen_ai.token.type': 'output' });
          m.llmDuration.record((performance.now() - started) / 1000, metricAttrs);
          return res;
        } catch (err) {
          const type = err instanceof DomainError ? err.code : 'LLM_FAILED';
          span.setAttribute(GenAi.ERROR_TYPE, type);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          claimMetrics().llmDuration.record((performance.now() - started) / 1000, {
            ...metricAttrs,
            [GenAi.ERROR_TYPE]: type,
          });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }
}
