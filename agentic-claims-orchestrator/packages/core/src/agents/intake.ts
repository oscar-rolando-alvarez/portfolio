import { z } from 'zod';
import { Severity, type ClaimState, type IntakeFlag, type IntakeResult } from '../domain/claim.ts';
import { completeStructured } from '../llm/structured.ts';
import type { StepDefinition } from '../runtime/graph.ts';
import { daysBetween } from './util.ts';
import { intakePrompt, looksLikeInjection } from './prompts.ts';

const IntakeLlmOutput = z.object({
  severity: Severity,
  summary: z.string().min(1).max(300),
  injectionSuspected: z.boolean(),
});

const AMOUNT_DOCS = new Set(['repair_estimate', 'invoice', 'medical_bill']);

export function ruleBasedSeverity(amount: number): IntakeResult['severity'] {
  if (amount >= 25_000) return 'high';
  if (amount >= 5_000) return 'medium';
  return 'low';
}

/** Intake agent: validates/normalizes the FNOL, flags risk signals, classifies severity. */
export const intakeAgent: StepDefinition<ClaimState> = {
  name: 'intake',
  kind: 'agent',
  description: 'Normalizes the FNOL, detects prompt-injection and reporting anomalies, classifies severity.',
  timeoutMs: 20_000,
  async execute(state, ctx) {
    const fnol = state.input;
    const flags = new Set<IntakeFlag>();
    if (looksLikeInjection(fnol.description)) flags.add('prompt_injection_suspected');
    if (daysBetween(fnol.lossDate, fnol.reportedDate) > 30) flags.add('late_reporting');
    if (!fnol.documents.some((d) => AMOUNT_DOCS.has(d.kind))) flags.add('missing_documents');

    const facts = {
      lineOfBusiness: fnol.lineOfBusiness,
      lossType: fnol.lossType,
      claimedAmount: fnol.claimedAmount,
      reportDelayDays: daysBetween(fnol.lossDate, fnol.reportedDate),
      documents: fnol.documents.map((d) => d.kind),
    };
    const { system, user } = intakePrompt(facts, fnol.description);
    const llm = await completeStructured(
      ctx.llm,
      { task: 'intake.classify', system, user, maxOutputTokens: 200, temperature: 0 },
      IntakeLlmOutput,
      ctx.signal,
    );

    let intake: IntakeResult;
    if (llm.ok) {
      if (llm.value.injectionSuspected) flags.add('prompt_injection_suspected');
      intake = {
        severity: llm.value.severity,
        summary: llm.value.summary,
        flags: [...flags],
        classifiedBy: 'llm',
      };
    } else {
      ctx.emit({ type: 'llm.fallback', payload: { task: 'intake.classify', reason: llm.reason } });
      intake = {
        severity: ruleBasedSeverity(fnol.claimedAmount),
        summary: `${fnol.lossType} claim on ${fnol.lineOfBusiness} policy for ${fnol.claimedAmount.toFixed(2)} USD.`,
        flags: [...flags],
        classifiedBy: 'rules',
      };
    }
    // Severity can be raised but never lowered below the amount-based floor by the model.
    const floor = ruleBasedSeverity(fnol.claimedAmount);
    const rank = { low: 0, medium: 1, high: 2 } as const;
    if (rank[intake.severity] < rank[floor]) intake.severity = floor;

    ctx.emit({
      type: 'intake.classified',
      payload: { severity: intake.severity, flags: intake.flags, classifiedBy: intake.classifiedBy },
    });
    return { ...state, intake };
  },
};
