"""Run both DAGs end to end with dag.test(): simulator -> deferrable sensor -> mapped loads."""

import duckdb
import pendulum
from airflow.models import DagBag

from include.ecommerce import source
from tests.conftest import DAGS_FOLDER


def test_simulate_then_load_twice(airflow_db, local_env):
    dags = DagBag(dag_folder=str(DAGS_FOLDER)).dags
    run_at = pendulum.datetime(2026, 11, 18, 2, tz="UTC")  # loads 17 Nov

    assert dags["ecommerce_source_simulator"].test(logical_date=run_at.subtract(hours=1)).state == "success"
    for _ in range(2):
        assert dags["ecommerce_daily_load"].test(logical_date=run_at).state == "success"

    expected = source.generate_day(run_at.subtract(days=1).date())
    with duckdb.connect(str(local_env / "warehouse.duckdb"), read_only=True) as con:
        (orders,) = con.execute("SELECT COUNT(*) FROM raw.orders").fetchone()
    assert orders == len(expected["orders"])
