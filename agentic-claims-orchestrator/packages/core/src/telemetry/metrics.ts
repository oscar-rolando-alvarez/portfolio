import type { Attributes, Counter, Histogram } from '@opentelemetry/api';
import { meter } from './semconv.ts';

interface Instruments {
  tokenUsage: Histogram;
  llmDuration: Histogram;
  stepDuration: Histogram;
  runsFinished: Counter;
  policyViolations: Counter;
  toolCalls: Counter;
}

let instruments: Instruments | undefined;

/** Lazily bound so that the meter provider registered at startup is picked up. */
export function claimMetrics(): Instruments {
  instruments ??= {
    tokenUsage: meter().createHistogram('gen_ai.client.token.usage', {
      description: 'Number of input and output tokens used',
      unit: '{token}',
    }),
    llmDuration: meter().createHistogram('gen_ai.client.operation.duration', {
      description: 'GenAI operation duration',
      unit: 's',
    }),
    stepDuration: meter().createHistogram('claims.step.duration', {
      description: 'Agent step duration (including retries)',
      unit: 's',
    }),
    runsFinished: meter().createCounter('claims.runs.finished', {
      description: 'Claim runs that reached a terminal or paused state',
    }),
    policyViolations: meter().createCounter('claims.policy.violations', {
      description: 'Guardrail violations detected (DLP egress hits, blocked actions)',
    }),
    toolCalls: meter().createCounter('claims.tool.calls', { description: 'MCP tool calls' }),
  };
  return instruments;
}

export function recordRunFinished(attrs: Attributes): void {
  claimMetrics().runsFinished.add(1, attrs);
}
