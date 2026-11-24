# ADR 0003 · Every task is idempotent and keyed by its data interval

- **Status:** accepted
- **Date:** 2026-11-18

## Context

Airflow retries tasks, operators clear runs, and backfills replay history, sometimes out of order. A task that appends on every attempt silently duplicates data. That is the most common correctness incident in batch platforms.

## Decision

A task may be merged only if running it twice for the same interval leaves the system in the same state. The accepted patterns, by target:

| Target | Pattern | Example in this repo |
|---|---|---|
| Files / object storage | Write the whole partition to a temporary key, then rename or overwrite it; the partition is derived from `data_interval_start` | Level 1 `storage.py` |
| Warehouse fact tables | `DELETE` + `INSERT` by load batch inside one transaction, with a reconciliation check before `COMMIT` | Level 2 `warehouse.py` |
| Warehouse dimensions | `MERGE` by natural key, deduped with `QUALIFY`, updating only when the incoming version is newer | Level 2 `sql.py` |
| dbt models | `incremental` with `unique_key` and a lookback window | Level 3 `fct_orders.sql` |
| Delta Lake | `replaceWhere` for owned partitions; insert-only `MERGE` on event id | Level 4 jobs |
| External job APIs | Idempotency token derived from (DAG, task, run) | Level 4 Databricks submit |

Rules that go with it: never use `now()` in business logic (use the interval); in Snowflake, `COPY INTO … FORCE = TRUE` into a fresh staging table so load history cannot empty a rerun; staging is session-scoped, never shared between concurrent runs.

## Consequences

Each pattern ships with a test that runs the load twice and, where relevant, replays an older interval after a newer one. Code review rejects plain `INSERT` into persistent tables without a partition delete or a key-based `MERGE`.
