# ADR 0001 - Kafka as the telemetry backbone, SQS for work dispatch

- Status: accepted
- Date: 2026-10-17

## Context
Telemetry is a high-volume, ordered, replayable stream (millions of devices, billions of readings per month).
Incidents are a low-volume set of independent jobs (enrich, diagnose) that call slow, rate-limited third-party
APIs and an LLM. The two workloads have opposite needs: the stream wants partition ordering, replay, consumer
groups and cheap per-byte cost; the jobs want per-message retries, visibility timeouts, dead-lettering and
independent concurrency control.

## Decision
- **Kafka** (Amazon MSK Serverless in AWS, Apache Kafka KRaft locally) carries telemetry. Records are keyed by
  **cell id**, so every event of a cell lands on the same partition and per-cell windows stay local to one
  consumer. The stream processor Lambda consumes through an MSK event source mapping.
- **SQS standard queues** (with DLQs and KMS) carry incident jobs between the stream processor, the enrichment
  worker and the diagnosis worker. Workers use partial batch failure reporting so one bad job never blocks or
  re-runs its siblings; `maximum_concurrency` on the event source mapping caps pressure on the LLM endpoint.
- Poison telemetry is quarantined to its own SQS queue instead of failing the Kafka batch (a failed batch would
  stall the partition).

## Consequences
- Telemetry can be replayed (new detector versions, backfills); the detector fences already-applied offsets.
- At-least-once delivery everywhere, so every consumer is idempotent (deterministic incident ids, Powertools
  idempotency on job handlers, conditional writes).
- Two messaging technologies to operate; justified because each is used for what it is good at.

## Alternatives considered
- **Kinesis Data Streams**: fully viable and simpler IAM; Kafka was chosen for ecosystem portability (operators
  often already run Kafka on-prem/at the edge) and for MSK Serverless' per-partition pricing at scale.
- **SQS only**: no replay, no ordering per cell, per-request pricing is expensive at billions of readings.
- **EventBridge for jobs**: good fan-out, but weaker retry/visibility semantics for long LLM calls.
