# ADR 0002 - AWS Lambda (arm64) instead of long-running containers

- Status: accepted
- Date: 2026-10-17

## Context
The platform has four compute roles: a stream processor, an enrichment worker, a diagnosis worker and a
read API. Traffic is spiky (incidents cluster around outages) and the buyer wants a cost that scales with
the fleet. The team is small; operating clusters (ECS/EKS) and Kafka consumers with rebalancing logic is a
real cost.

## Decision
Run all four roles as Python 3.13 Lambda functions on **arm64 (Graviton)**, packaged as one zip with four
handlers, using **AWS Lambda Powertools** for structured logging, tracing, metrics (EMF), batch processing,
idempotency and the API router. Event source mappings (MSK and SQS) own polling, batching, checkpointing
and scaling. A local runner (`fleetintel-local`) drives the same handlers from Kafka/moto for development.

## Consequences
- No servers, no consumer-group code, scale-to-zero for workers; per-invocation cost is visible in the cost
  model (requests + GB-seconds).
- The stream processor must be stateless between invocations: detector state is persisted per Kafka partition
  in DynamoDB with optimistic locking (see ADR 0004). State size is bounded and monitored (400 KB item limit).
- Cold starts on the API path (~hundreds of ms); acceptable for an operations API, mitigable with
  provisioned concurrency.
- 15-minute max duration and 10 GB memory are far above what the handlers need.

## Alternatives considered
- **ECS Fargate consumers**: better for very high sustained throughput and stateful stream processing
  (in-memory windows); more ops, idle cost. A good migration path if the stream exceeds what MSK ESM + Lambda
  handles economically - the domain core is framework-free, only handlers would change.
- **Managed Flink**: the "right" tool for complex event-time processing at very high scale, but heavier to
  build/operate and overkill for tumbling windows + EWMA.
