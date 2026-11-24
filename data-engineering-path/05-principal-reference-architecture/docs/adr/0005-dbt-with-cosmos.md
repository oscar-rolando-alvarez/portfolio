# ADR 0005 · Run dbt through Astronomer Cosmos, rendered from a prebuilt manifest

- **Status:** accepted
- **Date:** 2026-11-18

## Options

1. One `BashOperator` running `dbt build`: simple, but one failure means rerunning everything, and the logs and timing of 200 models are hidden in one task.
2. dbt Cloud jobs triggered from Airflow: good UX, separate bill, and lineage split across two tools.
3. **Cosmos**: renders each dbt model as an Airflow task with dbt's dependencies.

## Decision

Cosmos `DbtTaskGroup` with `LoadMode.DBT_MANIFEST` (manifest built in CI and shipped with the image), `TestBehavior.BUILD` (each task runs `dbt build` for its model so tests gate downstream models), dbt installed in an isolated virtualenv, and a pool sized to the transform warehouse.

## Consequences

- Per-model retries, SLAs and logs in Airflow; dbt lineage becomes task dependencies.
- The manifest must be rebuilt whenever the dbt project changes. CI does that, and the integrity test asserts one task per model.
- For projects above roughly 500 models, switch the large groups to `ExecutionMode.WATCHER` or select subsets per DAG to keep scheduling overhead down.
