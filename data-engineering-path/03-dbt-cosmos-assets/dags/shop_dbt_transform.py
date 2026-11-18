"""
### shop_dbt_transform

Runs the `shop` dbt project with **Astronomer Cosmos**: every dbt model becomes an
Airflow task (running `dbt build` for that model and its tests), with dbt's own
dependency graph, per-model retries and logs.

* **Scheduled by data, not time:** runs when `raw.customers`, `raw.orders` **and**
  `raw.payments` have all received a new Asset event.
* **Publishes** `marts.mart_daily_revenue` as an Asset, which triggers `revenue_report`.
"""

from __future__ import annotations

from datetime import timedelta

import pendulum
from airflow.sdk import dag, task
from cosmos import DbtTaskGroup

from include.ecommerce import assets
from include.ecommerce.dbt_config import execution_config, profile_config, project_config, render_config
from include.ecommerce.settings import WAREHOUSE_POOL


@dag(
    dag_id="shop_dbt_transform",
    schedule=(assets.RAW["customers"] & assets.RAW["orders"] & assets.RAW["payments"]),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    max_active_runs=1,
    default_args={"owner": "analytics-engineering", "retries": 2, "retry_delay": timedelta(minutes=1)},
    tags=["level-3", "dbt", "cosmos", "assets"],
    doc_md=__doc__,
)
def shop_dbt_transform():
    dbt = DbtTaskGroup(
        group_id="dbt_shop",
        project_config=project_config,
        profile_config=profile_config,
        execution_config=execution_config,
        render_config=render_config,
        operator_args={
            "pool": WAREHOUSE_POOL,  # same budget as the loaders: one writer locally
            "install_deps": False,  # no dbt packages; nothing fetched at runtime
            "emit_datasets": False,  # this project declares its Assets explicitly
        },
    )

    @task(outlets=[assets.MART_DAILY_REVENUE])
    def publish_mart() -> None:
        """Emits the Asset event only after every model and test in the group succeeded."""

    dbt >> publish_mart()


shop_dbt_transform()
