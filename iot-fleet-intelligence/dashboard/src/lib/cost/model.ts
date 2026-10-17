/**
 * Faithful TypeScript port of platform `fleetintel.cost.model.estimate` so the
 * what-if simulator recomputes instantly in the browser (and in demo mode).
 *
 * The pricing table is read from golden.json, which `fleetintel-cost golden`
 * generates from the same versioned YAML the Python model uses; model.test.ts
 * asserts every golden case to the cent, and CI fails if golden.json drifts.
 * Python uses Decimal; float64 is exact enough here (relative error ~1e-15).
 */
import golden from "./golden.json";

type Tier = { up_to_million: number | string | null; price_per_million: string };

export interface Pricing {
  version: string;
  region: string;
  hours_per_month: number;
  gib_bytes: number;
  iot_core: {
    connectivity_per_million_minutes: string;
    message_increment_bytes: number;
    messaging_tiers: Tier[];
    rules_per_million: string;
    actions_per_million: string;
  };
  msk_serverless: Record<string, string | number>;
  lambda_arm: { per_million_requests: string; per_gb_second: string };
  sqs_standard: { per_million_requests: string };
  dynamodb_on_demand: { per_million_wru: string; per_million_rru: string; storage_per_gb_month: string };
  api_gateway_http: { per_million_requests: string };
  cloudwatch_logs: { ingest_per_gb: string; storage_per_gb_month: string };
  xray: { per_million_traces: string };
  data_transfer: { internet_out_per_gb: string };
  kms: { per_key_month: string };
  llm_tiers: Record<"small" | "large", { input_per_million: string; output_per_million: string }>;
  embeddings_per_million_tokens: string;
}

export const PRICING = golden.pricing as unknown as Pricing;

export interface FleetProfile {
  devices: number;
  report_interval_seconds: number;
  payload_bytes: number;
  ingest_path: "iot_core" | "direct_kafka";
  connected_fraction: number;
  readings_per_message: number;
  compression_ratio: number;
  edge_filter_ratio: number;
  kafka_retention_hours: number;
  kafka_consumers: number;
  stream_batch_size: number;
  stream_batch_window_seconds: number;
  stream_memory_mb: number;
  stream_base_ms: number;
  stream_ms_per_reading: number;
  detector_state_kb: number;
  incidents_per_1k_devices_per_day: number;
  llm_share: number;
  llm_cache_hit_rate: number;
  llm_large_share: number;
  input_tokens_per_diagnosis: number;
  output_tokens_per_diagnosis: number;
  embedding_tokens_per_diagnosis: number;
  enrich_ms: number;
  diagnose_ms: number;
  diagnose_skipped_ms: number;
  worker_memory_mb: number;
  wru_per_incident: number;
  rru_per_incident: number;
  incident_kb: number;
  incident_retention_days: number;
  api_requests_per_month: number;
  api_ms: number;
  api_response_kb: number;
  rru_per_api_request: number;
  log_bytes_per_stream_invocation: number;
  log_bytes_per_worker_invocation: number;
  log_retention_days: number;
  xray_sampling: number;
  sqs_pollers_per_queue: number;
  kms_keys: number;
}

/** Defaults mirror FleetProfile in cost/model.py (documented assumptions). */
export const DEFAULT_PROFILE: FleetProfile = {
  devices: 1_000_000,
  report_interval_seconds: 300,
  payload_bytes: 512,
  ingest_path: "iot_core",
  connected_fraction: 1,
  readings_per_message: 1,
  compression_ratio: 1,
  edge_filter_ratio: 0,
  kafka_retention_hours: 24,
  kafka_consumers: 1,
  stream_batch_size: 500,
  stream_batch_window_seconds: 5,
  stream_memory_mb: 1024,
  stream_base_ms: 40,
  stream_ms_per_reading: 0.05,
  detector_state_kb: 32,
  incidents_per_1k_devices_per_day: 0.5,
  llm_share: 1,
  llm_cache_hit_rate: 0,
  llm_large_share: 1,
  input_tokens_per_diagnosis: 3500,
  output_tokens_per_diagnosis: 600,
  embedding_tokens_per_diagnosis: 300,
  enrich_ms: 1500,
  diagnose_ms: 6000,
  diagnose_skipped_ms: 300,
  worker_memory_mb: 256,
  wru_per_incident: 24,
  rru_per_incident: 8,
  incident_kb: 12,
  incident_retention_days: 90,
  api_requests_per_month: 100_000,
  api_ms: 60,
  api_response_kb: 4,
  rru_per_api_request: 4,
  log_bytes_per_stream_invocation: 1500,
  log_bytes_per_worker_invocation: 4000,
  log_retention_days: 30,
  xray_sampling: 0.05,
  sqs_pollers_per_queue: 5,
  kms_keys: 1,
};

export type Category =
  | "Ingest (IoT Core)"
  | "Streaming (MSK Serverless)"
  | "Compute (Lambda arm64)"
  | "Messaging (SQS)"
  | "Storage (DynamoDB)"
  | "API Gateway"
  | "Observability"
  | "Data transfer"
  | "Security (KMS)"
  | "GenAI (LLM)";

export const CATEGORIES: Category[] = [
  "Ingest (IoT Core)",
  "Streaming (MSK Serverless)",
  "Storage (DynamoDB)",
  "GenAI (LLM)",
  "Compute (Lambda arm64)",
  "Observability",
  "Security (KMS)",
  "Messaging (SQS)",
  "API Gateway",
  "Data transfer",
];

export interface LineItem {
  category: Category;
  item: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  monthlyUsd: number;
}

export interface Recommendation {
  id: RecommendationId;
  monthlySavingsUsd: number;
  newTotalUsd: number;
}

export interface CostReport {
  pricingVersion: string;
  profile: FleetProfile;
  lineItems: LineItem[];
  byCategory: Partial<Record<Category, number>>;
  totalUsd: number;
  perDeviceUsd: number;
  perMillionReadingsUsd: number;
  volumes: {
    readings: number;
    messages: number;
    ingest_gib: number;
    msk_partitions: number;
    stream_invocations: number;
    incidents: number;
    llm_calls: number;
  };
  recommendations: Recommendation[];
}

const MILLION = 1_000_000;
const n = (x: string | number) => Number(x);

export function tiered(unitsMillions: number, tiers: Tier[]): number {
  let cost = 0;
  let prev = 0;
  for (const t of tiers) {
    const cap = t.up_to_million === null ? null : n(t.up_to_million);
    const top = cap === null ? unitsMillions : Math.min(unitsMillions, cap);
    if (top > prev) cost += (top - prev) * n(t.price_per_million);
    if (cap === null || unitsMillions <= cap) break;
    prev = cap;
  }
  return cost;
}

export function estimate(profile: Partial<FleetProfile>, withRecommendations = true, pr: Pricing = PRICING): CostReport {
  const p: FleetProfile = { ...DEFAULT_PROFILE, ...profile };
  const gib = n(pr.gib_bytes);
  const hours = n(pr.hours_per_month);
  const days = hours / 24;
  const seconds = hours * 3600;
  const items: LineItem[] = [];
  const add = (category: Category, item: string, qty: number, unit: string, price: number, divisor = 1) =>
    items.push({ category, item, quantity: qty, unit, unitPrice: price, monthlyUsd: (qty / divisor) * price });

  const readings = (p.devices * 86_400 * hours) / (p.report_interval_seconds * 24);
  const keptReadings = readings * (1 - p.edge_filter_ratio);
  const messages = keptReadings / p.readings_per_message;
  const msgBytes = p.payload_bytes * p.readings_per_message * p.compression_ratio;
  const ingestGib = (messages * msgBytes) / gib;

  if (p.ingest_path === "iot_core") {
    const iot = pr.iot_core;
    const minutes = p.devices * p.connected_fraction * hours * 60;
    add("Ingest (IoT Core)", "Connectivity", minutes, "million connection-minutes", n(iot.connectivity_per_million_minutes), MILLION);
    const units = messages * Math.ceil(msgBytes / n(iot.message_increment_bytes));
    items.push({
      category: "Ingest (IoT Core)",
      item: "Messaging (5 KB units, tiered)",
      quantity: units,
      unit: "million messages",
      unitPrice: n(iot.messaging_tiers[0]!.price_per_million),
      monthlyUsd: tiered(units / MILLION, iot.messaging_tiers),
    });
    add("Ingest (IoT Core)", "Rules triggered", messages, "million rules", n(iot.rules_per_million), MILLION);
    add("Ingest (IoT Core)", "Rule actions (to MSK)", messages, "million actions", n(iot.actions_per_million), MILLION);
  }

  const msk = pr.msk_serverless;
  const mbPerS = (messages * msgBytes) / seconds / 1_000_000;
  const partitions = Math.max(n(msk.min_partitions!), Math.ceil(mbPerS / n(msk.ingress_mb_per_s_per_partition!)));
  add("Streaming (MSK Serverless)", "Cluster hours", hours, "cluster-hours", n(msk.cluster_hour!));
  add("Streaming (MSK Serverless)", "Partition hours", partitions * hours, "partition-hours", n(msk.partition_hour!));
  add("Streaming (MSK Serverless)", "Data in", ingestGib, "GB", n(msk.data_in_per_gb!));
  add("Streaming (MSK Serverless)", "Data out", ingestGib * p.kafka_consumers, "GB", n(msk.data_out_per_gb!));
  add(
    "Streaming (MSK Serverless)",
    "Storage (retention)",
    (ingestGib / hours) * p.kafka_retention_hours,
    "GB-month",
    n(msk.storage_per_gb_month!),
  );

  const gbsPrice = n(pr.lambda_arm.per_gb_second);
  const reqPrice = n(pr.lambda_arm.per_million_requests);
  const idleFloor = (partitions * seconds) / p.stream_batch_window_seconds;
  const streamInv = messages > 0 ? Math.min(messages, Math.max(messages / p.stream_batch_size, idleFloor)) : 0;
  const readingsPerInv = streamInv ? keptReadings / streamInv : 0;
  const streamS = (p.stream_base_ms + p.stream_ms_per_reading * readingsPerInv) / 1000;
  const streamGbs = (streamInv * streamS * p.stream_memory_mb) / 1024;
  const incidents = (p.devices * p.incidents_per_1k_devices_per_day * hours) / 24_000;
  const llmCalls = incidents * p.llm_share * (1 - p.llm_cache_hit_rate);
  const workerGb = p.worker_memory_mb / 1024;
  const enrichGbs = ((incidents * p.enrich_ms) / 1000) * workerGb;
  const diagGbs = ((llmCalls * p.diagnose_ms + (incidents - llmCalls) * p.diagnose_skipped_ms) / 1000) * workerGb;
  const apiGbs = ((p.api_requests_per_month * p.api_ms) / 1000) * workerGb;
  add("Compute (Lambda arm64)", "Stream processor requests", streamInv, "million requests", reqPrice, MILLION);
  add("Compute (Lambda arm64)", "Stream processor duration", streamGbs, "GB-seconds", gbsPrice);
  add("Compute (Lambda arm64)", "Enrichment + diagnosis requests", incidents * 2, "million requests", reqPrice, MILLION);
  add("Compute (Lambda arm64)", "Enrichment + diagnosis duration", enrichGbs + diagGbs, "GB-seconds", gbsPrice);
  add("Compute (Lambda arm64)", "API requests", p.api_requests_per_month, "million requests", reqPrice, MILLION);
  add("Compute (Lambda arm64)", "API duration", apiGbs, "GB-seconds", gbsPrice);

  const sqsRequests = incidents * 2 * 3 + (2 * p.sqs_pollers_per_queue * seconds) / 20;
  add(
    "Messaging (SQS)",
    "Requests (jobs + long-poll baseline)",
    sqsRequests,
    "million requests",
    n(pr.sqs_standard.per_million_requests),
    MILLION,
  );

  const stateWru = streamInv * p.detector_state_kb;
  const stateRru = streamInv * Math.ceil(p.detector_state_kb / 4);
  const wru = incidents * p.wru_per_incident + stateWru;
  const rru = incidents * p.rru_per_incident + stateRru + p.api_requests_per_month * p.rru_per_api_request;
  const ddb = pr.dynamodb_on_demand;
  add("Storage (DynamoDB)", "Write request units", wru, "million WRU", n(ddb.per_million_wru), MILLION);
  add("Storage (DynamoDB)", "Read request units", rru, "million RRU", n(ddb.per_million_rru), MILLION);
  const ddbGib = (((incidents * p.incident_retention_days) / days) * p.incident_kb * 1024) / gib;
  add("Storage (DynamoDB)", "Storage", ddbGib, "GB-month", n(ddb.storage_per_gb_month));

  add(
    "API Gateway",
    "HTTP API requests",
    p.api_requests_per_month,
    "million requests",
    n(pr.api_gateway_http.per_million_requests),
    MILLION,
  );

  const workerInv = incidents * 2 + p.api_requests_per_month;
  const logGib = (streamInv * p.log_bytes_per_stream_invocation + workerInv * p.log_bytes_per_worker_invocation) / gib;
  add("Observability", "CloudWatch Logs ingestion", logGib, "GB", n(pr.cloudwatch_logs.ingest_per_gb));
  add(
    "Observability",
    "CloudWatch Logs storage",
    (logGib * p.log_retention_days) / days,
    "GB-month",
    n(pr.cloudwatch_logs.storage_per_gb_month),
  );
  add(
    "Observability",
    "X-Ray traces (sampled)",
    (streamInv + workerInv) * p.xray_sampling,
    "million traces",
    n(pr.xray.per_million_traces),
    MILLION,
  );

  const egressGib = (p.api_requests_per_month * p.api_response_kb * 1024) / gib;
  add("Data transfer", "Internet egress (API)", egressGib, "GB", n(pr.data_transfer.internet_out_per_gb));
  add("Security (KMS)", "Customer-managed keys", p.kms_keys, "key-months", n(pr.kms.per_key_month));

  const { small, large } = pr.llm_tiers;
  const blendIn = (1 - p.llm_large_share) * n(small.input_per_million) + p.llm_large_share * n(large.input_per_million);
  const blendOut = (1 - p.llm_large_share) * n(small.output_per_million) + p.llm_large_share * n(large.output_per_million);
  add("GenAI (LLM)", "Input tokens", llmCalls * p.input_tokens_per_diagnosis, "million tokens", blendIn, MILLION);
  add("GenAI (LLM)", "Output tokens", llmCalls * p.output_tokens_per_diagnosis, "million tokens", blendOut, MILLION);
  add(
    "GenAI (LLM)",
    "Embedding tokens (RAG query)",
    llmCalls * p.embedding_tokens_per_diagnosis,
    "million tokens",
    n(pr.embeddings_per_million_tokens),
    MILLION,
  );

  const byCategory: Partial<Record<Category, number>> = {};
  for (const it of items) byCategory[it.category] = (byCategory[it.category] ?? 0) + it.monthlyUsd;
  const total = items.reduce((s, it) => s + it.monthlyUsd, 0);
  return {
    pricingVersion: pr.version,
    profile: p,
    lineItems: items,
    byCategory,
    totalUsd: total,
    perDeviceUsd: total / p.devices,
    perMillionReadingsUsd: readings ? (total / readings) * MILLION : 0,
    volumes: {
      readings,
      messages,
      ingest_gib: ingestGib,
      msk_partitions: partitions,
      stream_invocations: streamInv,
      incidents,
      llm_calls: llmCalls,
    },
    recommendations: withRecommendations ? recommend(p, total, pr) : [],
  };
}

export type RecommendationId = "batch" | "compress" | "filter" | "cache" | "tiering" | "mskBatch" | "logs";

const VARIANTS: { id: RecommendationId; applies: (p: FleetProfile) => boolean; change: Partial<FleetProfile> }[] = [
  { id: "batch", applies: (p) => p.ingest_path === "iot_core" && p.readings_per_message < 10, change: { readings_per_message: 10 } },
  { id: "compress", applies: (p) => p.compression_ratio === 1, change: { compression_ratio: 0.5 } },
  { id: "filter", applies: (p) => p.edge_filter_ratio === 0, change: { edge_filter_ratio: 0.3 } },
  { id: "cache", applies: (p) => p.llm_cache_hit_rate < 0.3, change: { llm_cache_hit_rate: 0.3 } },
  { id: "tiering", applies: (p) => p.llm_large_share > 0.2, change: { llm_large_share: 0.2 } },
  { id: "mskBatch", applies: (p) => p.stream_batch_size < 2000, change: { stream_batch_size: 2000, stream_batch_window_seconds: 10 } },
  {
    id: "logs",
    applies: (p) => p.log_bytes_per_stream_invocation > 500,
    change: { log_bytes_per_stream_invocation: 300, log_bytes_per_worker_invocation: 1500 },
  },
];

/** Same English titles as the Python model, so golden recommendations can be compared. */
export const RECOMMENDATION_TITLES: Record<RecommendationId, string> = {
  batch: "Batch 10 readings per message at the edge",
  compress: "Compress payloads (CBOR + zstd, ~50%)",
  filter: "Report by exception (filter 30% unchanged readings at the edge)",
  cache: "Cache diagnoses for repeated incident signatures (30% hit rate)",
  tiering: "Model tiering: small model first, escalate 20% to the large tier",
  mskBatch: "Larger MSK batches (2,000 records / 10 s window)",
  logs: "Trim log volume (structured, sampled debug logs, 300 B/invocation)",
};

export function recommend(p: FleetProfile, total: number, pr: Pricing = PRICING): Recommendation[] {
  const floor = Math.max(1, total * 0.005);
  const out: Recommendation[] = [];
  for (const v of VARIANTS) {
    if (!v.applies(p)) continue;
    const newTotal = estimate({ ...p, ...v.change }, false, pr).totalUsd;
    const savings = total - newTotal;
    if (savings >= floor) out.push({ id: v.id, monthlySavingsUsd: savings, newTotalUsd: newTotal });
  }
  return out.sort((a, b) => b.monthlySavingsUsd - a.monthlySavingsUsd);
}

export const LLM_PRICES = PRICING.llm_tiers;
