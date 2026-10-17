import { trace } from '@opentelemetry/api';
import { pino } from 'pino';
import type { Logger } from '@aco/core';

/**
 * Structured JSON logger with trace correlation (trace_id/span_id) and a redaction list that
 * implements the "PII never reaches logs" data policy for known sensitive keys.
 */
export function createLogger(opts: { level?: string; name?: string } = {}): Logger & { raw: pino.Logger } {
  const raw = pino({
    name: opts.name ?? 'claims-orchestrator',
    level: opts.level ?? 'info',
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'claimant',
        '*.claimant',
        'email',
        'phone',
        'fullName',
        'content',
        '*.content',
        'authorization',
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'apiKey',
      ],
      censor: '[REDACTED]',
    },
    mixin() {
      const span = trace.getActiveSpan()?.spanContext();
      return span ? { trace_id: span.traceId, span_id: span.spanId } : {};
    },
  });
  return {
    raw,
    debug: (o, m) => {
      raw.debug(o, m);
    },
    info: (o, m) => {
      raw.info(o, m);
    },
    warn: (o, m) => {
      raw.warn(o, m);
    },
    error: (o, m) => {
      raw.error(o, m);
    },
  };
}
