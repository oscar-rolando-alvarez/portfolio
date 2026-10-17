import { z } from 'zod';
import { HumanDecision } from '../claims-graph.ts';
import { FnolInput, type ClaimState, type TokenizedFnol } from '../domain/claim.ts';
import { DomainError } from '../domain/errors.ts';
import { redactPii } from '../privacy/dlp.ts';
import type { PiiVault } from '../privacy/pii-vault.ts';
import { verifyAuditChain, type ChainVerification } from '../runtime/audit-chain.ts';
import type { Orchestrator } from '../runtime/orchestrator.ts';
import {
  silentLogger,
  type ApprovalRequest,
  type AuditEvent,
  type Logger,
  type RunRecord,
} from '../runtime/types.ts';

export const Role = z.enum([
  'claims_intake',
  'adjuster',
  'senior_adjuster',
  'siu_investigator',
  'auditor',
  'operator',
]);
export type Role = z.infer<typeof Role>;

export interface Principal {
  id: string;
  tenantId: string;
  roles: readonly Role[];
}

export interface ClaimView {
  claimId: string;
  status: RunRecord<ClaimState>['status'];
  currentStep: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: RunRecord<ClaimState>['lastError'];
  usage: RunRecord<ClaimState>['usage'];
  input: Omit<TokenizedFnol, 'documents'> & { documents: { documentId: string; kind: string }[] };
  intake: ClaimState['intake'] | null;
  extraction: ClaimState['extraction'] | null;
  coverage: ClaimState['coverage'] | null;
  fraud: ClaimState['fraud'] | null;
  decision: ClaimState['decision'] | null;
  routing: ClaimState['routing'] | null;
  review: ClaimState['review'] | null;
  final: ClaimState['final'] | null;
  pendingApproval: Pick<
    ApprovalRequest,
    'approvalId' | 'requiredRole' | 'ruleIds' | 'reasons' | 'createdAt'
  > | null;
}

function requireRole(p: Principal, ...roles: Role[]): void {
  if (!roles.some((r) => p.roles.includes(r))) {
    throw new DomainError('FORBIDDEN', `requires one of roles: ${roles.join(', ')}`);
  }
}

/**
 * Application service (use cases). Shared by the HTTP API, the CLI and the eval harness so
 * every entry point goes through the same authorization, PII tokenization and idempotency.
 */
export class ClaimsService {
  private readonly orchestrator: Orchestrator<ClaimState>;
  private readonly vault: PiiVault;
  private readonly logger: Logger;
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(deps: { orchestrator: Orchestrator<ClaimState>; vault: PiiVault; logger?: Logger }) {
    this.orchestrator = deps.orchestrator;
    this.vault = deps.vault;
    this.logger = deps.logger ?? silentLogger;
  }

  /** Tokenizes every PII-bearing field before anything is persisted or sent to a model. */
  async tokenize(tenantId: string, raw: unknown): Promise<TokenizedFnol> {
    const parsed = FnolInput.safeParse(raw);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 'invalid FNOL payload', {
        details: { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      });
    }
    const f = parsed.data;
    const known = [f.claimant.fullName];
    const description = await redactPii(
      f.description,
      (kind, value) => this.vault.tokenize(tenantId, kind, value),
      known,
    );
    return {
      policyNumber: f.policyNumber,
      lineOfBusiness: f.lineOfBusiness,
      lossType: f.lossType,
      lossDate: f.lossDate,
      reportedDate: f.reportedDate,
      incidentHour: f.incidentHour,
      description: description.text,
      claimedAmount: f.claimedAmount,
      policeReportFiled: f.policeReportFiled,
      claimant: {
        fullName: await this.vault.tokenize(tenantId, 'name', f.claimant.fullName),
        email: await this.vault.tokenize(tenantId, 'email', f.claimant.email),
        phone: await this.vault.tokenize(tenantId, 'phone', f.claimant.phone),
      },
      documents: await Promise.all(
        f.documents.map(async (d) => ({
          documentId: d.documentId,
          kind: d.kind,
          contentRef: await this.vault.tokenize(tenantId, 'document', d.content),
        })),
      ),
    };
  }

  async submit(
    principal: Principal,
    raw: unknown,
    idempotencyKey: string,
    opts: { wait?: boolean } = {},
  ): Promise<{ claim: ClaimView; created: boolean }> {
    requireRole(principal, 'claims_intake');
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new DomainError('VALIDATION_FAILED', 'Idempotency-Key must be 8-128 chars of [A-Za-z0-9._:-]');
    }
    const input = await this.tokenize(principal.tenantId, raw);
    const { run, created } = await this.orchestrator.start({
      tenantId: principal.tenantId,
      idempotencyKey,
      actor: `user:${principal.id}`,
      initialState: (runId) => ({ claimId: runId, tenantId: principal.tenantId, input }),
    });
    if (!created && JSON.stringify(run.state.input) !== JSON.stringify(input)) {
      throw new DomainError('CONFLICT', 'Idempotency-Key was already used with a different payload');
    }
    let current = run;
    if (created || run.status === 'running') {
      if (opts.wait) current = await this.orchestrator.drive(run.runId);
      else this.background(this.orchestrator.drive(run.runId));
    }
    return { claim: await this.view(current), created };
  }

  async get(principal: Principal, claimId: string): Promise<ClaimView> {
    const run = await this.orchestrator.store.getRun(claimId, principal.tenantId);
    if (!run) throw new DomainError('NOT_FOUND', 'claim not found');
    return this.view(run);
  }

  async audit(
    principal: Principal,
    claimId: string,
  ): Promise<{ events: AuditEvent[]; verification: ChainVerification }> {
    requireRole(principal, 'auditor', 'adjuster', 'senior_adjuster', 'siu_investigator');
    const run = await this.orchestrator.store.getRun(claimId, principal.tenantId);
    if (!run) throw new DomainError('NOT_FOUND', 'claim not found');
    const events = await this.orchestrator.store.listEvents(claimId, principal.tenantId);
    return { events, verification: verifyAuditChain(events) };
  }

  async pendingApprovals(principal: Principal): Promise<ApprovalRequest[]> {
    return this.orchestrator.store.listApprovals({
      tenantId: principal.tenantId,
      status: 'pending',
      roles: [...principal.roles],
    });
  }

  async decide(
    principal: Principal,
    claimId: string,
    approvalId: string,
    body: unknown,
    opts: { wait?: boolean } = {},
  ): Promise<ClaimView> {
    const decision = HumanDecision.safeParse(body);
    if (!decision.success) {
      throw new DomainError('VALIDATION_FAILED', decision.error.issues[0]?.message ?? 'invalid decision');
    }
    const approval = await this.orchestrator.store.getApproval(approvalId, principal.tenantId);
    if (approval?.runId !== claimId) throw new DomainError('NOT_FOUND', 'approval not found');
    if (!principal.roles.includes(approval.requiredRole as Role)) {
      throw new DomainError('FORBIDDEN', `approval requires role ${approval.requiredRole}`);
    }
    // Four-eyes principle: whoever submitted the claim cannot approve it.
    const events = await this.orchestrator.store.listEvents(claimId, principal.tenantId);
    if (events.find((e) => e.type === 'run.created')?.actor === `user:${principal.id}`) {
      throw new DomainError('FORBIDDEN', 'the submitter of a claim cannot decide its approval');
    }
    // Fail fast on overrides that the BLOCK-FINAL-* invariants would reject anyway.
    if (decision.data.decision === 'override' && decision.data.outcome === 'approve') {
      const current = await this.orchestrator.store.getRun(claimId, principal.tenantId);
      const coverage = current?.state.coverage;
      if (!coverage?.covered) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'cannot override to approve a claim without confirmed coverage',
        );
      }
      if ((decision.data.payoutAmount ?? 0) > coverage.coverageLimit) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `payoutAmount exceeds coverage limit ${coverage.coverageLimit}`,
        );
      }
    }
    const run = this.orchestrator.decide({
      tenantId: principal.tenantId,
      runId: claimId,
      approvalId,
      decidedBy: principal.id,
      decision: decision.data,
      status: decision.data.decision === 'approve' ? 'approved' : 'overridden',
    });
    if (opts.wait === false) {
      this.background(run);
      return this.get(principal, claimId);
    }
    return this.view(await run);
  }

  async resume(principal: Principal, claimId: string): Promise<ClaimView> {
    requireRole(principal, 'operator');
    return this.view(await this.orchestrator.resume(claimId, principal.tenantId, principal.id));
  }

  /** Waits for background drives (graceful shutdown, tests). */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
  }

  private background(p: Promise<unknown>): void {
    const tracked = p
      .catch((err: unknown) => {
        this.logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'background drive failed',
        );
      })
      .finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }

  async view(run: RunRecord<ClaimState>): Promise<ClaimView> {
    const pending =
      run.status === 'awaiting_approval'
        ? (await this.orchestrator.store.listApprovals({ tenantId: run.tenantId, status: 'pending' })).find(
            (a) => a.runId === run.runId,
          )
        : undefined;
    const s = run.state;
    return {
      claimId: run.runId,
      status: run.status,
      currentStep: run.currentStep,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      lastError: run.lastError,
      usage: run.usage,
      input: {
        ...s.input,
        documents: s.input.documents.map((d) => ({ documentId: d.documentId, kind: d.kind })),
      },
      intake: s.intake ?? null,
      extraction: s.extraction ?? null,
      coverage: s.coverage ?? null,
      fraud: s.fraud ?? null,
      decision: s.decision ?? null,
      routing: s.routing ?? null,
      review: s.review ?? null,
      final: s.final ?? null,
      pendingApproval: pending
        ? {
            approvalId: pending.approvalId,
            requiredRole: pending.requiredRole,
            ruleIds: pending.ruleIds,
            reasons: pending.reasons,
            createdAt: pending.createdAt,
          }
        : null,
    };
  }
}
