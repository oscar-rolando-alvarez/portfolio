import { z } from 'zod';
import { DocumentKind, LineOfBusiness, LossType } from '../domain/claim.ts';

/**
 * Tool contracts shared by MCP servers (which implement them) and the MCP gateway (which
 * validates every call against them on the way in AND on the way out). Agents only ever see
 * the *sanitized* output type, i.e. after PII tokenization.
 */

export const ToolName = z.enum(['policy_lookup', 'claims_history', 'document_extract']);
export type ToolName = z.infer<typeof ToolName>;

// ---------- policy_lookup ----------
export const PolicyLookupInput = z.object({
  policyNumber: z.string().regex(/^POL-\d{6}$/),
});
export const PolicyRecord = z.object({
  policyNumber: z.string(),
  status: z.enum(['active', 'lapsed', 'cancelled']),
  lineOfBusiness: LineOfBusiness,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  coveredPerils: z.array(LossType),
  coverageLimit: z.number().nonnegative(),
  deductible: z.number().nonnegative(),
  exclusions: z.array(z.string()),
});
export type PolicyRecord = z.infer<typeof PolicyRecord>;
export const PolicyLookupOutput = z.object({
  found: z.boolean(),
  policy: PolicyRecord.nullable(),
});
export type PolicyLookupOutput = z.infer<typeof PolicyLookupOutput>;

// ---------- claims_history ----------
export const ClaimsHistoryInput = z.object({
  policyNumber: z.string().regex(/^POL-\d{6}$/),
  asOf: z.iso.date(),
});
export const PriorClaim = z.object({
  claimId: z.string(),
  lossDate: z.iso.date(),
  lossType: LossType,
  paidAmount: z.number().nonnegative(),
  status: z.enum(['paid', 'denied', 'open', 'siu_closed']),
});
export const ClaimsHistoryOutput = z.object({
  policyNumber: z.string(),
  priorClaims: z.array(PriorClaim),
  claimsLast24Months: z.number().int().nonnegative(),
  totalPaidLast24Months: z.number().nonnegative(),
});
export type ClaimsHistoryOutput = z.infer<typeof ClaimsHistoryOutput>;

// ---------- document_extract ----------
/**
 * The document body never travels through agent state: agents pass an encrypted vault
 * reference and only the document_extract tool (the PII-privileged boundary) resolves it.
 */
export const DocumentExtractInput = z.object({
  tenantId: z.string().min(1).max(64),
  documentId: z.string().min(1).max(64),
  kind: DocumentKind,
  contentRef: z.string().regex(/^\[\[pii:document:[0-9a-f]{16}\]\]$/),
});
/** Raw tool output: may contain PII. It never leaves the gateway in this form. */
export const DocumentExtractRawOutput = z.object({
  documentId: z.string(),
  kind: DocumentKind,
  totalAmount: z.number().nonnegative().nullable(),
  documentDate: z.iso.date().nullable(),
  reference: z.string().nullable(),
  pii: z.object({
    names: z.array(z.string()),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
  }),
});
export type DocumentExtractRawOutput = z.infer<typeof DocumentExtractRawOutput>;
export interface DocumentExtractOutput {
  documentId: string;
  kind: z.infer<typeof DocumentKind>;
  totalAmount: number | null;
  documentDate: string | null;
  reference: string | null;
  piiTokens: string[];
}

export interface ToolIo {
  policy_lookup: { input: z.infer<typeof PolicyLookupInput>; output: PolicyLookupOutput };
  claims_history: { input: z.infer<typeof ClaimsHistoryInput>; output: ClaimsHistoryOutput };
  document_extract: { input: z.infer<typeof DocumentExtractInput>; output: DocumentExtractOutput };
}

export interface ToolCallOptions {
  signal?: AbortSignal;
  /** Propagated to the tool in MCP `_meta` so side-effecting tools can dedupe retries. */
  idempotencyKey?: string;
}

/** Port used by agents. The MCP gateway is the production implementation. */
export interface ToolGateway {
  call<N extends ToolName>(
    name: N,
    input: ToolIo[N]['input'],
    opts?: ToolCallOptions,
  ): Promise<ToolIo[N]['output']>;
}

export const toolContracts = {
  policy_lookup: {
    description: 'Look up an insurance policy by number: status, period, covered perils, limits, deductible.',
    input: PolicyLookupInput,
    rawOutput: PolicyLookupOutput,
    dataClassification: 'internal',
  },
  claims_history: {
    description: 'Prior claims for a policy as of a date, with 24-month frequency and severity aggregates.',
    input: ClaimsHistoryInput,
    rawOutput: ClaimsHistoryOutput,
    dataClassification: 'internal',
  },
  document_extract: {
    description:
      'Extract structured fields (total amount, document date, reference number) and PII entities from a claim document.',
    input: DocumentExtractInput,
    rawOutput: DocumentExtractRawOutput,
    dataClassification: 'pii',
  },
} as const;
