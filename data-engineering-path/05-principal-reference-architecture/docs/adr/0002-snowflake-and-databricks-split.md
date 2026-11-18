# ADR 0002 · Snowflake for governed SQL and BI, Databricks for Spark workloads, S3 + Delta in between

- **Status:** accepted
- **Date:** 2026-11-18

## Context

The company already uses Snowflake for finance and BI. A new product-analytics initiative brings high-volume semi-structured clickstream data (tens of GB per day) and future ML feature pipelines. The question is whether to run everything on one platform or to split the workload.

## Decision

- **Snowflake** owns curated relational data and everything analysts touch: `RAW` → dbt `STAGING` → `MARTS`, BI warehouses, row-access policies and masking.
- **Databricks** owns Spark-shaped work: clickstream bronze/silver/gold on Delta Lake in S3, and later ML features. Jobs run on ephemeral job clusters bound by a cluster policy.
- **The contract between them is data in S3**, not a platform-to-platform pipeline: gold Delta tables (or Parquet exports) are read by Snowflake through the storage integration (external or Iceberg tables), so no copy jobs move data between the two.
- Airflow orchestrates both. Neither platform's own scheduler (Snowflake Tasks, Databricks Workflows) owns a cross-platform dependency.

## Consequences

- Two bills and two governance models (Snowflake RBAC, Unity Catalog). Mitigated with one naming convention, functional roles mirrored in both, and a single lineage graph (OpenLineage, ADR 0007).
- Engineers need both skill sets; the learning path in this repository covers both.
- **Revisit** if the clickstream volume stays small enough for Snowflake (Snowpark, dynamic tables), in which case the Databricks footprint should be retired, or if ML becomes the dominant workload, in which case more marts would move to Databricks SQL.
