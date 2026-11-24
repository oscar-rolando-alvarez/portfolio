"""Run the real DAG end to end in-process with dag.test() (offline fixture mode)."""

import pandas as pd
import pendulum
from airflow.models import DagBag

from tests.conftest import DAGS_FOLDER


def test_full_run_writes_one_partition_and_is_rerunnable(airflow_db, data_root):
    dag = DagBag(dag_folder=str(DAGS_FOLDER)).get_dag("weather_daily_ingest")
    logical_date = pendulum.datetime(2026, 11, 18, 2, tz="UTC")  # interval = 17 Nov 02:00 -> 18 Nov 02:00

    for _ in range(2):  # second run proves idempotency
        dag_run = dag.test(logical_date=logical_date, run_conf={"city": "medellin"})
        assert dag_run.state == "success"

    parquet = data_root / "curated/weather/city=medellin/date=2026-11-17/hourly.parquet"
    frame = pd.read_parquet(parquet)
    assert len(frame) == 24
    assert set(frame["city"]) == {"medellin"}
