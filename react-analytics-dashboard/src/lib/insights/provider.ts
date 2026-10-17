import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export interface InsightsModelConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

/**
 * Resolves the language model used for natural-language insights.
 *
 * Any OpenAI-compatible endpoint works (hosted APIs, a LiteLLM proxy, vLLM,
 * Ollama, LM Studio, ...). When no endpoint/model is configured the feature
 * degrades gracefully to deterministic rule-based insights.
 */
export function resolveInsightsModel(
  config: InsightsModelConfig = {
    baseURL: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  }
): LanguageModel | null {
  if (!config.baseURL || !config.model) return null;

  const provider = createOpenAICompatible({
    name: 'insights-llm',
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
  return provider.chatModel(config.model);
}
