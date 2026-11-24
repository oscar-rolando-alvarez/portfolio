"""
### revenue_report

Consumer of `marts.mart_daily_revenue`. Exports the last 7 days of revenue by
country to a CSV that a BI tool or an email job could pick up. It never asks
"is dbt finished?": it simply runs whenever the mart Asset is updated.
"""

from __future__ import annotations

import csv
from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.sdk import dag, task

from include.ecommerce import assets, warehouse
from include.ecommerce.settings import WAREHOUSE_POOL, data_root

QUERY = """
SELECT order_date, country_code, orders, paid_orders, revenue_usd, avg_paid_order_usd
FROM analytics_marts.mart_daily_revenue
WHERE order_date >= (SELECT MAX(order_date) FROM analytics_marts.mart_daily_revenue) - INTERVAL '6 days'
ORDER BY order_date, country_code
"""


@dag(
    dag_id="revenue_report",
    schedule=[assets.MART_DAILY_REVENUE],
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    default_args={"owner": "analytics-engineering", "retries": 1, "retry_delay": timedelta(seconds=30)},
    tags=["level-3", "assets", "reporting"],
    doc_md=__doc__,
)
def revenue_report():
    @task(pool=WAREHOUSE_POOL)
    def export(run_id=None, triggering_asset_events=None) -> str:
        for asset, events in (triggering_asset_events or {}).items():
            print(f"triggered by {asset} ({len(events)} event(s))")
        rows = warehouse.from_env().query(QUERY)
        target = Path(data_root()) / "reports" / "daily_revenue_latest.csv"
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["order_date", "country_code", "orders", "paid_orders", "revenue_usd", "avg_usd"])
            writer.writerows(rows)
        print(f"wrote {len(rows)} rows to {target}")
        return str(target)

    export()


revenue_report()
