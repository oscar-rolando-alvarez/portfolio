import { z } from 'zod';
import { DomainError, TransientError, type LlmPort, type LlmRequest, type LlmResponse } from '@aco/core';

const ChatCompletion = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export interface OpenAiCompatibleOptions {
  /** e.g. https://api.openai.com/v1, https://<resource>.openai.azure.com/openai/v1, http://localhost:11434/v1 */
  baseUrl: string;
  apiKey?: string;
  /** Header carrying the key: "authorization" (Bearer, default) or e.g. "api-key". */
  authHeader?: string;
  model: string;
  providerName?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Provider-agnostic adapter for any OpenAI-compatible Chat Completions endpoint
 * (OpenAI, Azure OpenAI v1, vLLM, Ollama, LiteLLM proxy, ...). Retries are owned by the
 * orchestrator; this adapter only classifies failures as transient or permanent.
 */
export class OpenAiCompatibleLlm implements LlmPort {
  readonly provider: string;
  readonly model: string;
  private readonly opts: OpenAiCompatibleOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAiCompatibleOptions) {
    this.opts = opts;
    this.model = opts.model;
    this.provider = opts.providerName ?? 'openai_compatible';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.opts.apiKey) {
      const header = (this.opts.authHeader ?? 'authorization').toLowerCase();
      headers[header] = header === 'authorization' ? `Bearer ${this.opts.apiKey}` : this.opts.apiKey;
    }
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      temperature: request.temperature ?? 0,
      max_tokens: request.maxOutputTokens ?? 512,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
    };
    const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 30_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combined,
      });
    } catch (err) {
      throw new TransientError(
        `LLM request failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    if (res.status === 429 || res.status >= 500) {
      throw new TransientError(`LLM provider returned ${res.status}`);
    }
    if (!res.ok) {
      // Never echo the response body: providers sometimes reflect the prompt in errors.
      throw new DomainError('LLM_FAILED', `LLM provider rejected the request with ${res.status}`);
    }
    const parsed = ChatCompletion.safeParse(await res.json());
    if (!parsed.success) throw new DomainError('LLM_FAILED', 'unexpected LLM response shape');
    const choice = parsed.data.choices[0];
    return {
      text: choice?.message.content ?? '',
      model: parsed.data.model ?? this.model,
      finishReason: choice?.finish_reason ?? 'unknown',
      usage: {
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
