/**
 * Wire contract shared with the live gateway (gateway/internal/agg/types.go)
 * and the platform incident API (platform/src/fleetintel/domain.py).
 * Gateway frames are camelCase; platform payloads are passed through in snake_case.
 */

export type FaultType = "cell_outage" | "congestion" | "reconnect_storm" | "roaming_misconfig" | "apn_error" | "firmware_regression";

export type RootCause = FaultType | "insufficient_evidence";
export type ScopeType = "cell" | "plmn" | "apn" | "firmware";
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "OPEN" | "ENRICHED" | "DIAGNOSED" | "NEEDS_REVIEW" | "RESOLVED";

export interface Histogram {
  edges: number[];
  counts: number[];
}

export interface DimStat {
  key: string;
  events: number;
  failRatio: number;
  resetRatio: number;
  reconnectsPerEvent: number;
  sinr: number;
  health: number;
  anomaly: number;
}

export interface Anomaly {
  scopeType: ScopeType;
  scope: string;
  kind: FaultType;
  score: number;
  z: number;
  onsetMs: number;
}

export interface Snapshot {
  seq: number;
  ts: number;
  eventsPerSec: number;
  bytesPerSec: number;
  devicesOnline: number;
  devicesSeen: number;
  availability: number;
  connected: number;
  noService: number;
  attachReject: number;
  pdnReject: number;
  resets: number;
  latencyMs: number;
  rsrp: Histogram;
  sinr: Histogram;
  ratMix: Record<string, number>;
  anomalyScore: number;
  anomalies: Anomaly[];
  topCells: DimStat[];
  topFirmware: DimStat[];
  topCarriers: DimStat[];
  topApns: DimStat[];
  sampledEvents: number;
}

export interface CellFrame {
  ts: number;
  ids: string[];
  health: number[];
  anomaly: number[];
  events: number[];
  online: number[];
}

export interface Point {
  ts: number;
  eventsPerSec: number;
  devicesOnline: number;
  availability: number;
  anomalyScore: number;
}

// ---- platform payloads (snake_case, as served by GET /v1/incidents/{id}) ----

export interface MetricSignal {
  metric: string;
  value: number;
  baseline: number;
  zscore: number;
}

export interface Incident {
  incident_id: string;
  tenant: string;
  suspected_fault: FaultType;
  scope_type: ScopeType;
  scope: string;
  status: IncidentStatus;
  opened_at: string;
  last_seen_at: string;
  windows: number;
  severity: Severity;
  affected_devices: number;
  total_devices: number;
  signals: MetricSignal[];
  sample_device_ids: string[];
  top_causes: Record<string, number>;
  context: Record<string, string>;
}

export interface EnrichmentItem {
  source: string;
  status: "ok" | "degraded" | "unavailable";
  data: Record<string, unknown>;
  error: string | null;
  latency_ms: number;
  cached: boolean;
}

export interface RemediationStep {
  order: number;
  action: string;
  owner: "noc" | "core_network" | "device_ops" | "carrier_relations" | "field_service" | "customer_success";
  automated: boolean;
}

export interface Diagnosis {
  root_cause: RootCause;
  confidence: number;
  summary: string;
  evidence: string[];
  remediation_steps: RemediationStep[];
  truck_roll_required: boolean;
  customer_message: string;
  referenced_device_ids: string[];
  runbook_ids: string[];
}

export interface DiagnosisRecord {
  incident_id: string;
  diagnosis: Diagnosis;
  model: string;
  provider: string;
  guardrail_status: "passed" | "refused" | "repaired";
  guardrail_notes: string[];
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  created_at: string;
  prompt_version: string;
  locale?: string;
  available_locales?: string[];
}

export interface Detection {
  gatewayOnsetMs?: number;
  confirmedMs: number;
  leadSeconds?: number;
}

/** One incident as streamed by the gateway: platform payloads + both diagnosis locales. */
export interface IncidentView {
  incident: Incident;
  enrichment: { incident_id: string; items: EnrichmentItem[] } | null;
  diagnosis: Partial<Record<"en" | "es", DiagnosisRecord>>;
  detection: Detection;
}

export interface Hello {
  version: string;
  mode: "live" | "demo";
  tenant: string;
  serverTime: number;
  history: Point[];
  incidents: IncidentView[];
}

export type StreamMode = "demo" | "live";
export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "error";
