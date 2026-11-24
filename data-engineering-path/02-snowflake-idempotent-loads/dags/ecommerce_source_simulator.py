"""
### ecommerce_source_simulator

Stands in for an upstream OLTP export job. For each daily interval it drops one CSV
per table into the landing zone and, last, a `_SUCCESS` marker that tells consumers
the extract is complete. Deterministic per day, so reruns produce identical files.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.sdk import CronDataIntervalTimetable, dag, task

from include.ecommerce import source
from include.ecommerce.settings import data_root


@dag(
    dag_id="ecommerce_source_simulator",
    schedule=CronDataIntervalTimetable("0 1 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    default_args={"owner": "data-platform", "retries": 1, "retry_delay": timedelta(seconds=30)},
    tags=["level-2", "simulator"],
    doc_md=__doc__,
)
def ecommerce_source_simulator():
    @task
    def drop_extracts(data_interval_start=None) -> dict[str, int]:
        return source.write_extracts(Path(data_root()), data_interval_start.date())

    drop_extracts()


ecommerce_source_simulator()
