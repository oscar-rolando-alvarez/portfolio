import { z } from 'zod';

/**
 * Claim domain model. Everything that crosses a trust boundary (API, tools, LLM output)
 * is described by a Zod schema; TypeScript types are inferred from the schemas so the
 * runtime contract and the compile-time contract can never drift apart.
 */

export const LineOfBusiness = z.enum(['auto', 'property']);
export type LineOfBusiness = z.infer<typeof LineOfBusiness>;

export const LossType = z.enum(['collision', 'theft', 'vandalism', 'glass', 'water_damage', 'fire', 'storm']);
export type LossType = z.infer<typeof LossType>;

export const DocumentKind = z.enum([
  'police_report',
  'repair_estimate',
  'invoice',
  'medical_bill',
  'photo_report',
]);
export type DocumentKind = z.infer<typeof DocumentKind>;

const IsoDate = z.iso.date();

export const FnolDocument = z.object({
  documentId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  kind: DocumentKind,
  /** Text content (OCR output or e-form). In production this would be an object-store reference. */
  content: z.string().min(1).max(20_000),
});
export type FnolDocument = z.infer<typeof FnolDocument>;

export const Claimant = z.object({
  fullName: z.string().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().min(7).max(32),
});
export type Claimant = z.infer<typeof Claimant>;

/** First Notice Of Loss as submitted by a channel (portal, call-center, broker API). Contains raw PII. */
export const FnolInput = z
  .object({
    policyNumber: z.string().regex(/^POL-\d{6}$/, 'policyNumber must look like POL-123456'),
    lineOfBusiness: LineOfBusiness,
    lossType: LossType,
    lossDate: IsoDate,
    reportedDate: IsoDate,
    incidentHour: z.number().int().min(0).max(23),
    description: z.string().min(10).max(4_000),
    claimedAmount: z.number().positive().max(5_000_000),
    policeReportFiled: z.boolean(),
    claimant: Claimant,
    documents: z.array(FnolDocument).max(10).default([]),
  })
  .refine((f) => f.reportedDate >= f.lossDate, {
    message: 'reportedDate must be on or after lossDate',
    path: ['reportedDate'],
  });
export type FnolInput = z.input<typeof FnolInput>;
export type FnolParsed = z.output<typeof FnolInput>;

/** Claimant after tokenization: raw values live only in the PII vault. */
export const TokenizedClaimant = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
});

/** The FNOL as stored in run state: PII replaced by vault tokens, free text DLP-redacted. */
export const TokenizedFnol = z.object({
  policyNumber: z.string(),
  lineOfBusiness: LineOfBusiness,
  lossType: LossType,
  lossDate: IsoDate,
  reportedDate: IsoDate,
  incidentHour: z.number().int(),
  description: z.string(),
  claimedAmount: z.number(),
  policeReportFiled: z.boolean(),
  claimant: TokenizedClaimant,
  /** Document bodies are stored encrypted in the vault; state only carries the reference. */
  documents: z.array(z.object({ documentId: z.string(), kind: DocumentKind, contentRef: z.string() })),
});
export type TokenizedFnol = z.infer<typeof TokenizedFnol>;

export const Severity = z.enum(['low', 'medium', 'high']);
export type Severity = z.infer<typeof Severity>;

export const IntakeFlag = z.enum(['prompt_injection_suspected', 'late_reporting', 'missing_documents']);
export type IntakeFlag = z.infer<typeof IntakeFlag>;

export interface IntakeResult {
  severity: Severity;
  summary: string;
  flags: IntakeFlag[];
  classifiedBy: 'llm' | 'rules';
}

export interface ExtractedDocument {
  documentId: string;
  kind: DocumentKind;
  totalAmount: number | null;
  documentDate: string | null;
  reference: string | null;
  /** Vault tokens for PII found in the document (never the raw values). */
  piiTokens: string[];
}

export type DocumentConsistency = 'consistent' | 'discrepancy' | 'insufficient';

export interface ExtractionResult {
  documents: ExtractedDocument[];
  /** Best substantiated amount (estimate/invoice/medical bill total), if any. */
  documentedAmount: number | null;
  consistency: DocumentConsistency;
}

export type CoverageReason =
  | 'POLICY_NOT_FOUND'
  | 'POLICY_INACTIVE'
  | 'LOSS_OUTSIDE_POLICY_PERIOD'
  | 'LINE_OF_BUSINESS_MISMATCH'
  | 'PERIL_NOT_COVERED'
  | 'EXCLUSION_APPLIES'
  | 'COVERED';

export interface CoverageResult {
  policyFound: boolean;
  covered: boolean;
  reasons: CoverageReason[];
  exclusionMatched: string | null;
  policyStartDate: string | null;
  coverageLimit: number;
  deductible: number;
  assessedAmount: number;
  payableAmount: number;
}

export interface FraudFactor {
  feature: string;
  value: number;
  contribution: number;
}

export type FraudBand = 'low' | 'medium' | 'high';

export interface FraudResult {
  score: number;
  band: FraudBand;
  modelVersion: string;
  features: Record<string, number>;
  topFactors: FraudFactor[];
  rationale: string;
  rationaleBy: 'llm' | 'template';
}

export const Outcome = z.enum(['approve', 'deny', 'refer_siu']);
export type Outcome = z.infer<typeof Outcome>;

export interface DecisionResult {
  outcome: Outcome;
  payoutAmount: number;
  reasons: string[];
  summary: string;
  summaryBy: 'llm' | 'template';
}

export const ReviewerRole = z.enum(['adjuster', 'senior_adjuster', 'siu_investigator']);
export type ReviewerRole = z.infer<typeof ReviewerRole>;

export type Routing = 'straight_through' | 'adjuster_review' | 'senior_adjuster_review' | 'siu_review';

export interface HumanReview {
  approvalId: string;
  requiredRole: ReviewerRole;
  ruleIds: string[];
  decision: 'approve' | 'override';
  decidedBy: string;
  comment: string | null;
  overrideOutcome: Outcome | null;
  overridePayout: number | null;
}

export interface FinalDecision {
  outcome: Outcome;
  payoutAmount: number;
  decidedBy: 'system' | 'human';
  routing: Routing;
  policyVersion: string | null;
}

/** Typed state carried through the agent graph and checkpointed after every step. */
export interface ClaimState {
  claimId: string;
  tenantId: string;
  input: TokenizedFnol;
  intake?: IntakeResult;
  extraction?: ExtractionResult;
  coverage?: CoverageResult;
  fraud?: FraudResult;
  decision?: DecisionResult;
  routing?: { routing: Routing; ruleIds: string[]; policyVersion: string };
  review?: HumanReview;
  final?: FinalDecision;
}

export function routingForRole(role: ReviewerRole | null): Routing {
  switch (role) {
    case null:
      return 'straight_through';
    case 'adjuster':
      return 'adjuster_review';
    case 'senior_adjuster':
      return 'senior_adjuster_review';
    case 'siu_investigator':
      return 'siu_review';
  }
}
