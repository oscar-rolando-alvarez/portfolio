"""Assets shared by producer and consumer DAGs (data-aware scheduling).

A DAG that lists an Asset in `outlets` emits an event when it updates it; a DAG
with `schedule=` on that Asset runs when the event arrives. No cron alignment,
no sensors polling another DAG's status.
"""

from __future__ import annotations

from airflow.sdk import Asset

from include.ecommerce.contracts import TABLES

RAW = {table: Asset(name=f"raw.{table}", uri=f"warehouse://analytics/raw/{table}") for table in TABLES}
MART_DAILY_REVENUE = Asset(
    name="marts.mart_daily_revenue", uri="warehouse://analytics/marts/mart_daily_revenue"
)
