"""
### ecommerce_daily_load

Loads the daily e-commerce extracts into the warehouse (Snowflake, or DuckDB locally),
idempotently.

1. **wait_for_extract**: a *deferrable* sensor waits for the `_SUCCESS` marker. While it
   waits, it holds no worker slot: the triggerer watches the file asynchronously.
2. **list_tables**: decides at runtime which tables to load (from the table contracts).
3. **load_table**: one mapped task instance per table (*dynamic task mapping*), all
   throttled by the `warehouse` pool so the warehouse never gets more concurrent loads
   than it was sized for.
   * facts (`orders`, `payments`): `DELETE` + `INSERT` by `_batch_date`
   * dimensions (`customers`): `MERGE` by natural key, newest version wins
   * reconcile staging vs target **inside** the transaction; commit only if it holds
4. **summarize**: collects the per-table results.

Running any interval twice, or backfilling out of order, leaves the warehouse unchanged.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.providers.standard.sensors.filesystem import FileSensor
from airflow.sdk import CronDataIntervalTimetable, dag, get_current_context, task

from include.ecommerce import source, warehouse
from include.ecommerce.contracts import TABLES
from include.ecommerce.settings import WAREHOUSE_POOL, data_root


@dag(
    dag_id="ecommerce_daily_load",
    schedule=CronDataIntervalTimetable("0 2 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    max_active_runs=2,
    default_args={
        "owner": "data-platform",
        "retries": 3,
        "retry_delay": timedelta(minutes=1),
        "retry_exponential_backoff": True,
    },
    tags=["level-2", "snowflake", "idempotent"],
    doc_md=__doc__,
)
def ecommerce_daily_load():
    wait_for_extract = FileSensor(
        task_id="wait_for_extract",
        fs_conn_id="fs_default",  # base path = data root (see AIRFLOW_CONN_FS_DEFAULT)
        filepath="landing/_SUCCESS/date={{ data_interval_start | ds }}",
        deferrable=True,
        poke_interval=30,
        timeout=int(timedelta(hours=6).total_seconds()),
    )

    @task
    def list_tables(data_interval_start=None) -> list[str]:
        day = data_interval_start.date()
        missing = [t for t in TABLES if not source.landing_file(Path(data_root()), t, day).exists()]
        if missing:
            raise FileNotFoundError(f"_SUCCESS present but extracts missing for {missing}")
        return list(TABLES)

    @task(pool=WAREHOUSE_POOL, map_index_template="{{ table_name }}")
    def load_table(table: str, data_interval_start=None) -> dict:
        get_current_context()["table_name"] = table  # label mapped instances by table in the UI
        day = data_interval_start.date()
        csv_path = source.landing_file(Path(data_root()), table, day)
        result = warehouse.from_env().load_batch(TABLES[table], csv_path, day.isoformat())
        print(f"Loaded {result}")
        return result.to_dict()

    @task
    def summarize(results: list[dict]) -> dict[str, int]:
        summary = {r["table"]: r["actual"] for r in results}
        print(f"Batch summary: {summary}")
        return summary

    tables = list_tables()
    wait_for_extract >> tables
    summarize(load_table.expand(table=tables))


ecommerce_daily_load()
