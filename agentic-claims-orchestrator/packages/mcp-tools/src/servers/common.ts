import { context, propagation, type Context } from '@opentelemetry/api';

export const SERVER_VERSION = '1.0.0';

/** Wraps a structured payload as an MCP tool result (text mirror for clients without structured output). */
export function structuredResult<T extends Record<string, unknown>>(payload: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Restores the caller's W3C trace context from MCP `_meta` (traceparent/tracestate keys). */
export function contextFromMeta(meta: Record<string, unknown> | undefined): Context {
  if (!meta) return context.active();
  const carrier: Record<string, string> = {};
  for (const key of ['traceparent', 'tracestate']) {
    const v = meta[key];
    if (typeof v === 'string') carrier[key] = v;
  }
  return propagation.extract(context.active(), carrier);
}
