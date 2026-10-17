import type { z } from 'zod';
import { BudgetExceededError } from '../domain/errors.ts';
import type { LlmPort, LlmRequest } from './types.ts';

export type StructuredResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Calls the model in JSON mode and validates the output with Zod. Never throws on bad model
 * output (callers fall back to deterministic logic); budget errors are rethrown because they
 * must stop the run.
 */
export async function completeStructured<S extends z.ZodType>(
  llm: LlmPort,
  request: LlmRequest,
  schema: S,
  signal?: AbortSignal,
): Promise<StructuredResult<z.infer<S>>> {
  try {
    const res = await llm.complete({ ...request, json: true }, signal);
    const parsed = schema.safeParse(extractJson(res.text));
    if (!parsed.success)
      return { ok: false, reason: `schema: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
    return { ok: true, value: parsed.data };
  } catch (err) {
    if (err instanceof BudgetExceededError) throw err;
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Free-text completion with graceful degradation to a deterministic template. */
export async function completeText(
  llm: LlmPort,
  request: LlmRequest,
  fallback: () => string,
  opts: { maxChars: number; signal?: AbortSignal },
): Promise<{ text: string; by: 'llm' | 'template' }> {
  try {
    const res = await llm.complete(request, opts.signal);
    const text = res.text.trim();
    if (text.length === 0) return { text: fallback(), by: 'template' };
    return { text: text.slice(0, opts.maxChars), by: 'llm' };
  } catch (err) {
    if (err instanceof BudgetExceededError) throw err;
    return { text: fallback(), by: 'template' };
  }
}
