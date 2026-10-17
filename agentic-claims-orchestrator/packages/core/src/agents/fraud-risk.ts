import type { ClaimState, FraudResult } from '../domain/claim.ts';
import { completeText } from '../llm/structured.ts';
import type { FraudModel } from '../ml/fraud-model.ts';
import type { StepDefinition } from '../runtime/graph.ts';
import type { ClaimsHistoryOutput } from '../tools/contracts.ts';
import { assessConsistency } from './extraction.ts';
import { fraudRationalePrompt } from './prompts.ts';
import { daysBetween } from './util.ts';

const POLICE_RELEVANT = new Set(['theft', 'collision', 'vandalism']);

const FEATURE_LABELS: Record<string, string> = {
  log_claim_amount: 'claim size',
  amount_to_limit: 'claim size relative to the coverage limit',
  policy_tenure_log: 'policy tenure',
  report_delay_days: 'delay in reporting the loss',
  prior_claims_24m: 'prior claims in the last 24 months',
  night_incident: 'night-time incident',
  missing_police_report: 'no police report for a crime-related loss',
  documentation_gap: 'gap between claimed and documented amounts',
};

/** Feature engineering — must match ml/train_fraud_model.py feature definitions exactly. */
export function computeFraudFeatures(
  state: ClaimState,
  history: ClaimsHistoryOutput,
): Record<string, number> {
  const fnol = state.input;
  const limit = state.coverage?.coverageLimit ?? 0;
  const tenureDays = state.coverage?.policyStartDate
    ? Math.max(0, daysBetween(state.coverage.policyStartDate, fnol.lossDate))
    : 0;
  const { gap } = assessConsistency(fnol.claimedAmount, state.extraction?.documentedAmount ?? null);
  return {
    log_claim_amount: Math.log1p(fnol.claimedAmount),
    amount_to_limit: limit > 0 ? Math.min(fnol.claimedAmount / limit, 3) : 3,
    policy_tenure_log: Math.log1p(tenureDays),
    report_delay_days: Math.min(Math.max(0, daysBetween(fnol.lossDate, fnol.reportedDate)), 365),
    prior_claims_24m: Math.min(history.claimsLast24Months, 10),
    night_incident: fnol.incidentHour < 5 ? 1 : 0,
    missing_police_report: POLICE_RELEVANT.has(fnol.lossType) && !fnol.policeReportFiled ? 1 : 0,
    documentation_gap: gap,
  };
}

export function templateRationale(
  score: number,
  factors: { feature: string; contribution: number }[],
): string {
  const drivers = factors
    .filter((f) => f.contribution > 0)
    .slice(0, 3)
    .map((f) => FEATURE_LABELS[f.feature] ?? f.feature);
  const pct = (score * 100).toFixed(1);
  if (drivers.length === 0)
    return `Model risk score ${pct}%. No feature increases risk above the portfolio baseline.`;
  return `Model risk score ${pct}%. Main risk drivers: ${drivers.join('; ')}. Scores are indicative and require human judgement.`;
}

/** Fraud-risk agent: classical ML scores the claim; the LLM only explains the score in plain language. */
export function createFraudRiskAgent(model: FraudModel): StepDefinition<ClaimState> {
  return {
    name: 'fraudRisk',
    kind: 'agent',
    description: 'Scores fraud risk with the offline-trained logistic regression and explains the drivers.',
    timeoutMs: 20_000,
    async execute(state, ctx) {
      const history = await ctx.tools.call(
        'claims_history',
        { policyNumber: state.input.policyNumber, asOf: state.input.lossDate },
        { signal: ctx.signal },
      );
      const features = computeFraudFeatures(state, history);
      const scored = model.score(features);
      const topFactors = scored.factors.slice(0, 4).map((f) => ({
        feature: f.feature,
        value: Math.round(f.value * 1e4) / 1e4,
        contribution: Math.round(f.contribution * 1e4) / 1e4,
      }));
      const { system, user } = fraudRationalePrompt({
        score: Math.round(scored.probability * 1e4) / 1e4,
        band: scored.band,
        topFactors: topFactors.map((f) => ({ ...f, label: FEATURE_LABELS[f.feature] ?? f.feature })),
      });
      const rationale = await completeText(
        ctx.llm,
        { task: 'fraud.rationale', system, user, maxOutputTokens: 160, temperature: 0 },
        () => templateRationale(scored.probability, topFactors),
        { maxChars: 600, signal: ctx.signal },
      );
      const fraud: FraudResult = {
        score: Math.round(scored.probability * 1e4) / 1e4,
        band: scored.band,
        modelVersion: scored.modelVersion,
        features: Object.fromEntries(
          Object.entries(features).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4]),
        ),
        topFactors,
        rationale: rationale.text,
        rationaleBy: rationale.by,
      };
      ctx.emit({
        type: 'fraud.scored',
        payload: {
          score: fraud.score,
          band: fraud.band,
          modelVersion: fraud.modelVersion,
          topFactors: topFactors.map((f) => f.feature),
          rationaleBy: fraud.rationaleBy,
        },
      });
      return { ...state, fraud };
    },
  };
}
