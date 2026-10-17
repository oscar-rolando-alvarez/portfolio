/**
 * Business-value model behind the executive overview. Every input is an
 * explicit, user-editable assumption shown in the assumptions panel; the
 * platform cost comes from the same estimator as the cost simulator.
 *
 * Defaults match the value hypothesis in the project README: ~0.3
 * connectivity truck rolls per 1k devices per month, 20-30% of them avoidable
 * with a remote root cause, USD 150-500 per truck roll.
 */
import { estimate, type FleetProfile } from "./cost/model";
import type { IncidentView, Point } from "./stream/types";

export interface Assumptions {
  truckRollsPer1kDevicesMonth: number;
  avoidableShare: number; // share of those dispatches that a remote diagnosis prevents
  truckRollCostUsd: number;
  slaAvailabilityTarget: number; // e.g. 0.995
  copPerUsd: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  truckRollsPer1kDevicesMonth: 0.3,
  avoidableShare: 0.25,
  truckRollCostUsd: 350,
  slaAvailabilityTarget: 0.995,
  copPerUsd: 4000,
};

export const DAYS_PER_MONTH = 730 / 24; // AWS billing month, same as the cost model

export function monthProgress(nowMs: number): { day: number; fraction: number } {
  const d = new Date(nowMs);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const days = (nowMs - start) / 86_400_000;
  return { day: days, fraction: Math.min(1, days / DAYS_PER_MONTH) };
}

export interface ValueSummary {
  baselineTruckRolls: number; // per month, without the platform
  truckRollsAvoided: number; // month to date
  savingsUsd: number; // month to date
  projectedSavingsUsd: number; // full month
  platformCostUsd: number; // full month (estimator)
  platformCostMtdUsd: number;
  costPerDeviceUsd: number;
  llmSpendMtdUsd: number;
  llmSpendMonthUsd: number;
  roi: number; // (savings - cost) / cost, full month
  incidentsMtd: number;
  remoteFixableShare: number | null; // observed in diagnosed incidents this session
}

export function remoteFixableShare(incidents: IncidentView[]): number | null {
  const diagnosed = incidents
    .map((v) => v.diagnosis.en?.diagnosis)
    .filter((d): d is NonNullable<typeof d> => !!d && d.root_cause !== "insufficient_evidence");
  if (diagnosed.length === 0) return null;
  return diagnosed.filter((d) => !d.truck_roll_required).length / diagnosed.length;
}

export function valueSummary(
  devices: number,
  a: Assumptions,
  nowMs: number,
  incidents: IncidentView[],
  profile: Partial<FleetProfile> = {},
): ValueSummary {
  const { fraction } = monthProgress(nowMs);
  const cost = estimate({ ...profile, devices }, false);
  const baseline = (devices / 1000) * a.truckRollsPer1kDevicesMonth;
  const avoidedMonth = baseline * a.avoidableShare;
  const projected = avoidedMonth * a.truckRollCostUsd;
  const llm = cost.byCategory["GenAI (LLM)"] ?? 0;
  return {
    baselineTruckRolls: baseline,
    truckRollsAvoided: avoidedMonth * fraction,
    savingsUsd: projected * fraction,
    projectedSavingsUsd: projected,
    platformCostUsd: cost.totalUsd,
    platformCostMtdUsd: cost.totalUsd * fraction,
    costPerDeviceUsd: cost.perDeviceUsd,
    llmSpendMtdUsd: llm * fraction,
    llmSpendMonthUsd: llm,
    roi: cost.totalUsd > 0 ? (projected - cost.totalUsd) / cost.totalUsd : 0,
    incidentsMtd: cost.volumes.incidents * fraction,
    remoteFixableShare: remoteFixableShare(incidents),
  };
}

/** Share of samples meeting the availability target (SLA compliance over the window). */
export function slaCompliance(history: Point[], target: number): number | null {
  if (history.length === 0) return null;
  return history.filter((p) => p.availability >= target).length / history.length;
}

/** Mean seconds between the gateway's live anomaly signal and the confirmed incident. */
export function meanDetectionLead(incidents: IncidentView[]): number | null {
  const leads = incidents.map((v) => v.detection.leadSeconds).filter((x): x is number => typeof x === "number" && x > 0);
  return leads.length ? leads.reduce((s, x) => s + x, 0) / leads.length : null;
}

/** Mean seconds from incident confirmation to remediation approval/dispatch or resolution. */
export function meanTimeToRemediate(incidents: IncidentView[], actions: Record<string, { at: number } | undefined>): number | null {
  const durations: number[] = [];
  for (const v of incidents) {
    const opened = v.detection.confirmedMs || Date.parse(v.incident.opened_at);
    const act = actions[v.incident.incident_id];
    if (act) durations.push((act.at - opened) / 1000);
    else if (v.incident.status === "RESOLVED") durations.push((Date.parse(v.incident.last_seen_at) - opened) / 1000);
  }
  const ok = durations.filter((d) => d > 0);
  return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : null;
}

/** Tokens and list-price spend of the diagnoses seen this session (large tier). */
export function sessionLlmSpend(incidents: IncidentView[], inPerM: number, outPerM: number) {
  let input = 0;
  let output = 0;
  for (const v of incidents) {
    const d = v.diagnosis.en;
    if (d) {
      input += d.input_tokens;
      output += d.output_tokens;
    }
  }
  return { input, output, usd: (input * inPerM + output * outPerM) / 1_000_000 };
}
