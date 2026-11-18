"""
### shop_raw_ingest

Simulates the daily upstream extract and loads it idempotently into `raw.*`
(the Level 2 loader, condensed). When every table has loaded, it emits one
**Asset event per raw table**, with row counts as event metadata. That event,
not a clock, is what starts the dbt transformation.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.sdk import CronDataIntervalTimetable, Metadata, dag, get_current_context, task

from include.ecommerce import assets, source, warehouse
from include.ecommerce.contracts import TABLES
from include.ecommerce.settings import WAREHOUSE_POOL, data_root


@dag(
    dag_id="shop_raw_ingest",
    schedule=CronDataIntervalTimetable("0 2 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    max_active_runs=1,
    default_args={"owner": "data-platform", "retries": 2, "retry_delay": timedelta(seconds=30)},
    tags=["level-3", "ingestion", "assets"],
    doc_md=__doc__,
)
def shop_raw_ingest():
    @task
    def extract(data_interval_start=None) -> list[str]:
        source.write_extracts(Path(data_root()), data_interval_start.date())
        return list(TABLES)

    @task(pool=WAREHOUSE_POOL, map_index_template="{{ table_name }}")
    def load_table(table: str, data_interval_start=None) -> dict:
        get_current_context()["table_name"] = table
        day = data_interval_start.date()
        csv_path = source.landing_file(Path(data_root()), table, day)
        return warehouse.from_env().load_batch(TABLES[table], csv_path, day.isoformat()).to_dict()

    @task(outlets=list(assets.RAW.values()))
    def publish_raw_assets(results: list[dict]):
        for result in results:
            yield Metadata(
                assets.RAW[result["table"]],
                {"batch_date": result["batch_date"], "rows": result["actual"]},
            )

    publish_raw_assets(load_table.expand(table=extract()))


shop_raw_ingest()
