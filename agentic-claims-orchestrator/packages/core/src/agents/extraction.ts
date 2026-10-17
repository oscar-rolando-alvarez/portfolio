import type { ClaimState, DocumentConsistency, ExtractedDocument } from '../domain/claim.ts';
import type { StepDefinition } from '../runtime/graph.ts';

const AMOUNT_DOCS = new Set(['repair_estimate', 'invoice', 'medical_bill']);
export const DISCREPANCY_TOLERANCE = 0.2;

export function assessConsistency(
  claimed: number,
  documented: number | null,
): { consistency: DocumentConsistency; gap: number } {
  if (documented === null) return { consistency: 'insufficient', gap: 1 };
  const gap = Math.min(1, Math.abs(claimed - documented) / claimed);
  return { consistency: gap > DISCREPANCY_TOLERANCE ? 'discrepancy' : 'consistent', gap };
}

/** Extraction agent: runs every attached document through the MCP document_extract tool. */
export const extractionAgent: StepDefinition<ClaimState> = {
  name: 'extraction',
  kind: 'agent',
  description:
    'Extracts amounts, dates and references from claim documents via the document_extract MCP tool.',
  timeoutMs: 30_000,
  async execute(state, ctx) {
    const documents: ExtractedDocument[] = [];
    for (const doc of state.input.documents) {
      const out = await ctx.tools.call(
        'document_extract',
        { tenantId: state.tenantId, documentId: doc.documentId, kind: doc.kind, contentRef: doc.contentRef },
        { signal: ctx.signal },
      );
      documents.push({
        documentId: out.documentId,
        kind: out.kind,
        totalAmount: out.totalAmount,
        documentDate: out.documentDate,
        reference: out.reference,
        piiTokens: out.piiTokens,
      });
    }
    const amounts = documents
      .filter((d) => AMOUNT_DOCS.has(d.kind) && d.totalAmount !== null)
      .map((d) => d.totalAmount ?? 0);
    const documentedAmount = amounts.length > 0 ? Math.max(...amounts) : null;
    const { consistency } = assessConsistency(state.input.claimedAmount, documentedAmount);

    ctx.emit({
      type: 'extraction.completed',
      payload: { documents: documents.length, documentedAmount, consistency },
    });
    return { ...state, extraction: { documents, documentedAmount, consistency } };
  },
};
