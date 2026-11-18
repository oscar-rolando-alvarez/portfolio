"""ingest -> dbt (via Cosmos) -> report, each executed for real with dag.test()."""

import csv

import pendulum
from airflow.models import DagBag

from tests.conftest import DAGS_FOLDER


def test_three_dags_end_to_end(airflow_db, local_env):
    dags = DagBag(dag_folder=str(DAGS_FOLDER)).dags
    run_at = pendulum.datetime(2026, 11, 18, 2, tz="UTC")

    assert dags["shop_raw_ingest"].test(logical_date=run_at).state == "success"
    assert dags["shop_dbt_transform"].test().state == "success"
    assert dags["revenue_report"].test().state == "success"

    with (local_env / "reports" / "daily_revenue_latest.csv").open() as handle:
        rows = list(csv.DictReader(handle))
    assert rows and {r["order_date"] for r in rows} == {"2026-11-17"}
