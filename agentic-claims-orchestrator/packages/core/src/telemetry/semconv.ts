import { metrics, trace } from '@opentelemetry/api';

/**
 * OpenTelemetry GenAI semantic convention attribute names (development status in semconv,
 * pinned here so a semconv package bump cannot silently rename our telemetry).
 * https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const GenAi = {
  OPERATION_NAME: 'gen_ai.operation.name',
  PROVIDER_NAME: 'gen_ai.provider.name',
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  RESPONSE_MODEL: 'gen_ai.response.model',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  CONVERSATION_ID: 'gen_ai.conversation.id',
  AGENT_NAME: 'gen_ai.agent.name',
  AGENT_ID: 'gen_ai.agent.id',
  AGENT_DESCRIPTION: 'gen_ai.agent.description',
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_CALL_ID: 'gen_ai.tool.call.id',
  TOOL_TYPE: 'gen_ai.tool.type',
  TOOL_DESCRIPTION: 'gen_ai.tool.description',
  OUTPUT_TYPE: 'gen_ai.output.type',
  ERROR_TYPE: 'error.type',
} as const;

export const Mcp = {
  METHOD_NAME: 'mcp.method.name',
  SESSION_ID: 'mcp.session.id',
} as const;

/** Project-specific attributes live under one namespace. */
export const Claims = {
  RUN_ID: 'claims.run.id',
  TENANT_ID: 'claims.tenant.id',
  STEP: 'claims.step.name',
  ATTEMPT: 'claims.step.attempt',
  STATUS: 'claims.run.status',
  OUTCOME: 'claims.decision.outcome',
  ROUTING: 'claims.routing',
  LLM_TASK: 'claims.llm.task',
  COST_USD: 'claims.llm.cost_usd',
} as const;

export const TRACER_NAME = 'agentic-claims-orchestrator';

export const tracer = () => trace.getTracer(TRACER_NAME, '0.1.0');
export const meter = () => metrics.getMeter(TRACER_NAME, '0.1.0');
