import { McpServer } from '@modelcontextprotocol/server';
import { DocumentExtractInput, DocumentExtractRawOutput, scanPii, toolContracts } from '@aco/core';
import { SERVER_VERSION, structuredResult, toolError } from './common.ts';
import { traced } from './tracing.ts';

/** Resolves an encrypted document reference. Only this (PII-privileged) tool gets this capability. */
export type DocumentResolver = (tenantId: string, contentRef: string) => Promise<string | null>;

const AMOUNT_RE =
  /(?:grand total|total amount|amount due|estimate total|total|balance due)\s*[:=]?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i;
const DATE_RE = /\b(?:date(?: of service| of loss| issued)?)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})\b/i;
const REF_RE =
  /\b(?:report|invoice|estimate|reference|ref|case)\s*(?:no\.?|number|#)\s*[:=]?\s*([A-Z0-9][A-Z0-9-]{3,})/i;
const NAME_RE =
  /\b(?:[Cc]laimant|[Ii]nsured|[Pp]atient|[Cc]ustomer|[Nn]ame|[Oo]wner|[Bb]ill to)[ \t]*[:=][ \t]*([A-Z][a-z]+(?:[ \t][A-Z][a-z'-]+){1,3})/g;

/**
 * Deterministic document understanding (stands in for an IDP/OCR service). Returns structured
 * fields plus detected PII entities; the gateway tokenizes the PII before agents see it.
 */
export function extractFields(content: string) {
  const amount = AMOUNT_RE.exec(content)?.[1];
  const names = [...content.matchAll(NAME_RE)].map((m) => m[1]).filter((n): n is string => n !== undefined);
  const findings = scanPii(content);
  const pick = (kind: string) =>
    findings.filter((f) => f.kind === kind).map((f) => content.slice(f.start, f.end));
  return {
    totalAmount: amount ? Number(amount.replace(/,/g, '')) : null,
    documentDate: DATE_RE.exec(content)?.[1] ?? null,
    reference: REF_RE.exec(content)?.[1] ?? null,
    pii: {
      names: [...new Set(names)],
      emails: [...new Set(pick('email'))],
      phones: [...new Set(pick('phone'))],
    },
  };
}

export function createDocumentExtractServer(resolve: DocumentResolver): McpServer {
  const server = new McpServer({ name: 'document-extract', version: SERVER_VERSION });
  server.registerTool(
    'document_extract',
    {
      title: 'Document extraction',
      description: toolContracts.document_extract.description,
      inputSchema: DocumentExtractInput,
      outputSchema: DocumentExtractRawOutput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    (args, ctx) =>
      traced('document_extract', ctx.mcpReq._meta, async () => {
        const content = await resolve(args.tenantId, args.contentRef);
        if (content === null) return toolError(`document ${args.documentId} not found`);
        return structuredResult({ documentId: args.documentId, kind: args.kind, ...extractFields(content) });
      }),
  );
  return server;
}
