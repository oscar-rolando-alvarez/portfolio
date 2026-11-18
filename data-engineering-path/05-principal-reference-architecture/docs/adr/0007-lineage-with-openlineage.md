# ADR 0007 · Capture lineage with OpenLineage; Marquez as the reference backend

- **Status:** accepted
- **Date:** 2026-11-18

## Context

Questions like "what breaks if I change this column?" or "which dashboards used yesterday's bad batch?" need lineage across Airflow, Snowflake, dbt and Databricks. Each platform has its own lineage view; none sees the others.

## Decision

- Emit **OpenLineage** events from every system that supports it: the Airflow provider (SQL operators are parsed automatically, Cosmos/dbt, Databricks via `openlineage_inject_parent_job_info`), and the Spark OpenLineage listener on job clusters.
- Send them to one HTTP endpoint. **Marquez** is the reference implementation (Level 5 runs it locally); the endpoint is a Terraform variable, so DataHub, Atlan or a managed catalog can replace it without code changes.
- Lineage is tested: the CI suite parses each SQL task with the OpenLineage SQL parser and asserts the expected inputs, outputs and column lineage, so a refactor cannot silently make lineage disappear.

## Consequences

- Lineage is vendor-neutral and covers the whole path, from source file to mart and dashboard.
- Aliasing aggregate columns becomes a convention, because unaliased expressions lose column-level lineage (a test caught exactly this).
- Event volume is small (two events per task attempt); the HTTP transport has a timeout so a lineage outage never fails a pipeline.
