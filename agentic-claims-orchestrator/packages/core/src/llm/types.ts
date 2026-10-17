/** Provider-agnostic chat completion port (OpenAI-compatible semantics). */
export interface LlmRequest {
  /** Logical task name, e.g. "intake.classify" — used for tracing, metrics and the fake provider. */
  task: string;
  system: string;
  user: string;
  /** Ask the provider for a JSON object response. */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage: LlmUsage;
  finishReason: string;
}

export interface LlmPort {
  readonly provider: string;
  readonly model: string;
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

export interface LlmPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
}

export function costOf(usage: LlmUsage, pricing: LlmPricing): number {
  return (usage.inputTokens * pricing.inputPerMTok + usage.outputTokens * pricing.outputPerMTok) / 1_000_000;
}

/** Cheap, provider-independent token estimate (~4 chars/token) used for pre-flight budget checks. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
