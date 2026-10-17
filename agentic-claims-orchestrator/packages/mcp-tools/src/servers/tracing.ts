import { SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import { GenAi, Mcp, tracer } from '@aco/core';
import { contextFromMeta } from './common.ts';

/** Server-side span for an MCP tool invocation, parented to the caller's trace via `_meta`. */
export async function traced<T>(
  tool: string,
  meta: Record<string, unknown> | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const parent = contextFromMeta(meta);
  return context.with(parent, () =>
    tracer().startActiveSpan(
      `tools/call ${tool}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          [Mcp.METHOD_NAME]: 'tools/call',
          [GenAi.TOOL_NAME]: tool,
          [GenAi.OPERATION_NAME]: 'execute_tool',
        },
      },
      async (span) => {
        try {
          return await fn();
        } catch (err) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        } finally {
          span.end();
        }
      },
    ),
  );
}
