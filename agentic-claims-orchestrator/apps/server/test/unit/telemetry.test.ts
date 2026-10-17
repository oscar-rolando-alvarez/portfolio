import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRINCIPALS, offlineSystem, scenario } from '../support/system.ts';

const exporter = new InMemorySpanExporter();
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
  );
});
afterAll(() => {
  trace.disable();
  context.disable();
});

describe('OpenTelemetry instrumentation (GenAI semantic conventions)', () => {
  it('traces the run, every agent step, LLM call and MCP tool call in one trace', async () => {
    const c = await offlineSystem();
    const intake = PRINCIPALS.intake;
    if (!intake) throw new Error('principal');
    const { claim } = await c.service.submit(intake, scenario('S02').fnol, 'otel-trace-0001', { wait: true });
    await c.close();
    const spans = exporter.getFinishedSpans();
    const names = spans.map((s) => s.name);

    expect(names).toContain('claims.run claims-triage');
    for (const step of ['intake', 'extraction', 'coverage', 'fraudRisk', 'decision']) {
      expect(names).toContain(`invoke_agent ${step}`);
    }
    expect(names).toContain('step finalize');
    expect(names).toContain('chat fake-claims-llm-1');
    expect(names).toContain('execute_tool policy_lookup');
    expect(names).toContain('tools/call policy_lookup');

    const chat = spans.find((s) => s.name === 'chat fake-claims-llm-1');
    expect(chat?.attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'fake',
      'gen_ai.request.model': 'fake-claims-llm-1',
      'gen_ai.conversation.id': claim.claimId,
    });
    expect(chat?.attributes['gen_ai.usage.input_tokens']).toBeGreaterThan(0);

    const tool = spans.find((s) => s.name === 'execute_tool document_extract');
    expect(tool?.attributes).toMatchObject({
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'document_extract',
      'mcp.method.name': 'tools/call',
      'claims.tool.data_classification': 'pii',
    });

    // single trace: the server-side MCP span is parented (via _meta traceparent) under the client span
    const root = spans.find((s) => s.name === 'claims.run claims-triage');
    const traceIds = new Set(
      spans
        .filter((s) => s.name !== 'claims.run claims-triage' || s === root)
        .map((s) => s.spanContext().traceId),
    );
    expect(traceIds.size).toBe(1);
    const server = spans.find((s) => s.name === 'tools/call policy_lookup');
    const client = spans.find((s) => s.name === 'execute_tool policy_lookup');
    expect(server?.parentSpanContext?.spanId).toBe(client?.spanContext().spanId);
  });
});
