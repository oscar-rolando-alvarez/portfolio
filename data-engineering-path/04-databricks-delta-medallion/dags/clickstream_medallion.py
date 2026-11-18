"""
### clickstream_medallion

Bronze → silver → gold on Delta Lake, orchestrated through the **Databricks Jobs API**
with `DatabricksSubmitRunOperator`.

* `MEDALLION_TARGET=local` (default): the `databricks-local` container runs each job
  on local Spark 4 + Delta Lake 4. No account needed.
* `MEDALLION_TARGET=databricks`: the same operators submit to a real workspace, with
  code from Git, a per-run job cluster and Unity Catalog tables.

Every submit carries an `idempotency_token`, so an Airflow retry re-attaches to the
run it already launched instead of starting a duplicate cluster. Operators are
`deferrable`: while Spark works, the triggerer polls and no worker slot is held.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

import pendulum
from airflow.providers.databricks.operators.databricks import DatabricksSubmitRunOperator
from airflow.sdk import Asset, CronDataIntervalTimetable, dag, task

from include.medallion.jobs import Target, submit_payload

TARGET = Target.from_env()
GOLD = Asset(name="gold.daily_metrics", uri="delta://lake/gold/daily_metrics")
BATCH = "{{ data_interval_start | ds }}"


def idempotency_token(*parts: str) -> str:
    """Databricks caps tokens at 64 chars; hash the (dag, task, run) identity."""
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:48]


@dag(
    dag_id="clickstream_medallion",
    schedule=CronDataIntervalTimetable("30 2 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    max_active_runs=1,
    default_args={
        "owner": "data-platform",
        "retries": 2,
        "retry_delay": timedelta(minutes=2),
        "databricks_conn_id": "databricks_default",
    },
    tags=["level-4", "databricks", "delta", "medallion"],
    user_defined_macros={"idempotency_token": idempotency_token},
    doc_md=__doc__,
)
def clickstream_medallion():
    @task
    def land_events(data_interval_start=None) -> str:
        """Simulated collector drop. In production this is an S3 prefix written upstream."""
        import sys

        sys.path.insert(0, "/opt/airflow/jobs")
        import generate_events

        return str(generate_events.write(TARGET.lake_root, data_interval_start.date()))

    layers = [
        DatabricksSubmitRunOperator(
            task_id=layer,
            json=submit_payload(TARGET, layer, BATCH),
            idempotency_token="{{ idempotency_token(dag.dag_id, task.task_id, run_id) }}",
            deferrable=True,
            polling_period_seconds=5 if TARGET.kind == "local" else 30,
            execution_timeout=timedelta(hours=1),
            outlets=[GOLD] if layer == "gold" else [],
        )
        for layer in ("bronze", "silver", "gold")
    ]

    land_events() >> layers[0] >> layers[1] >> layers[2]


clickstream_medallion()
