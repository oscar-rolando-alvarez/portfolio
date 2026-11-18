# ADR 0004 · Chain pipelines with Assets, not with clock offsets or cross-DAG sensors

- **Status:** accepted
- **Date:** 2026-11-18

## Context

Downstream DAGs used to be scheduled "one hour after ingestion" or blocked on `ExternalTaskSensor`. Clock offsets break when ingestion is late; sensors couple DAG IDs and schedules across teams and occupy slots.

## Decision

- A producer declares the datasets it updates as **Airflow Assets** (`outlets`), emitted by an explicit final task so the event fires only after the whole unit of work succeeded. Event `Metadata` carries the batch date and row counts.
- Consumers schedule on Assets, using AND/OR conditions when they need several inputs (`raw.customers & raw.orders & raw.payments`).
- Asset names follow `<layer>.<table>`; the URI identifies the physical location. Asset ownership is part of the data contract: renaming one is a breaking change.
- Cron schedules remain only at the edges: ingestion from systems that cannot emit events.

## Consequences

- Teams depend on data, not on each other's DAG IDs or schedule times.
- An Asset event means "new data is available", not "the data is correct": quality gates stay inside the producer, before the publishing task.
- Cross-deployment events (another Airflow, a Snowflake task, an S3 notification) use the Assets REST API or `AssetWatcher`, so the same mechanism scales beyond one environment.
