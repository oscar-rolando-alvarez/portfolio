import { SpanKind, SpanStatusCode, context, propagation } from '@opentelemetry/api';
import type { Client } from '@modelcontextprotocol/client';
import {
  DocumentExtractRawOutput,
  DomainError,
  GenAi,
  Mcp,
  TransientError,
  toolContracts,
  tracer,
  type DocumentExtractOutput,
  type PiiVault,
  type ToolCallOptions,
  type ToolGateway,
  type ToolIo,
  type ToolName,
} from '@aco/core';

export type ToolClients = Readonly<Record<ToolName, Client>>;

/**
 * Governed MCP client. Every call is: input-validated (Zod) -> traced (GenAI execute_tool span,
 * W3C trace context propagated in MCP `_meta`) -> sent with an idempotency key and timeout ->
 * output-validated against the contract -> PII-tokenized before it is returned to an agent.
 */
export class McpToolGateway implements ToolGateway {
  private readonly clients: ToolClients;
  private readonly vault: PiiVault;
  private readonly timeoutMs: number;

  constructor(clients: ToolClients, vault: PiiVault, opts: { timeoutMs?: number } = {}) {
    this.clients = clients;
    this.vault = vault;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  /** Readiness check: every contracted tool must be advertised by its server with an output schema. */
  async verify(): Promise<{ tool: ToolName; ok: boolean }[]> {
    const results: { tool: ToolName; ok: boolean }[] = [];
    for (const [tool, client] of Object.entries(this.clients) as [ToolName, Client][]) {
      try {
        const { tools } = await client.listTools();
        results.push({ tool, ok: tools.some((t) => t.name === tool && t.outputSchema !== undefined) });
      } catch {
        results.push({ tool, ok: false });
      }
    }
    return results;
  }

  async call<N extends ToolName>(
    name: N,
    input: ToolIo[N]['input'],
    opts: ToolCallOptions = {},
  ): Promise<ToolIo[N]['output']> {
    const contract = toolContracts[name];
    const parsed = contract.input.safeParse(input);
    if (!parsed.success) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `invalid input for tool ${name}: ${parsed.error.issues[0]?.message ?? ''}`,
      );
    }
    const client = this.clients[name];
    return tracer().startActiveSpan(
      `execute_tool ${name}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          [GenAi.OPERATION_NAME]: 'execute_tool',
          [GenAi.TOOL_NAME]: name,
          [GenAi.TOOL_TYPE]: 'extension',
          [GenAi.TOOL_DESCRIPTION]: contract.description,
          [Mcp.METHOD_NAME]: 'tools/call',
          'claims.tool.data_classification': contract.dataClassification,
        },
      },
      async (span) => {
        try {
          const meta: Record<string, string> = {};
          propagation.inject(context.active(), meta);
          if (opts.idempotencyKey) meta['io.claims/idempotency-key'] = opts.idempotencyKey;
          if (opts.idempotencyKey) span.setAttribute(GenAi.TOOL_CALL_ID, opts.idempotencyKey);

          let result;
          try {
            result = await client.callTool(
              { name, arguments: parsed.data, _meta: meta },
              { timeout: this.timeoutMs, ...(opts.signal ? { signal: opts.signal } : {}) },
            );
          } catch (err) {
            // Transport-level failures (timeouts, broken pipes) are transient by nature.
            throw new TransientError(
              `tool ${name} transport failure: ${err instanceof Error ? err.message : String(err)}`,
              err,
            );
          }
          if (result.isError === true) {
            const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join(' ');
            throw new DomainError('TOOL_FAILED', `tool ${name} returned an error: ${text.slice(0, 300)}`);
          }
          const out = contract.rawOutput.safeParse(result.structuredContent);
          if (!out.success) {
            throw new DomainError('TOOL_FAILED', `tool ${name} violated its output contract`);
          }
          if (name === 'document_extract') {
            const tenantId = (parsed.data as ToolIo['document_extract']['input']).tenantId;
            return await this.tokenizeDocument(tenantId, DocumentExtractRawOutput.parse(out.data));
          }
          return out.data as ToolIo[N]['output'];
        } catch (err) {
          span.setAttribute(GenAi.ERROR_TYPE, err instanceof DomainError ? err.code : 'TOOL_FAILED');
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  /** Enforces DP-PII-NO-EGRESS at the tool boundary: raw entities are swapped for vault tokens. */
  private async tokenizeDocument(
    tenantId: string,
    raw: DocumentExtractRawOutput,
  ): Promise<DocumentExtractOutput> {
    const tokens = await Promise.all([
      ...raw.pii.names.map((v) => this.vault.tokenize(tenantId, 'name', v)),
      ...raw.pii.emails.map((v) => this.vault.tokenize(tenantId, 'email', v)),
      ...raw.pii.phones.map((v) => this.vault.tokenize(tenantId, 'phone', v)),
    ]);
    return {
      documentId: raw.documentId,
      kind: raw.kind,
      totalAmount: raw.totalAmount,
      documentDate: raw.documentDate,
      reference: raw.reference,
      piiTokens: [...new Set(tokens)],
    };
  }
}
