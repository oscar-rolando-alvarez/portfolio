"""
### revenue_lineage

A small SQL pipeline on PostgreSQL whose **column- and table-level lineage is captured
automatically** by the Airflow OpenLineage provider and sent to Marquez. Nothing in
the DAG mentions lineage: `SQLExecuteQueryOperator` SQL is parsed, and inputs/outputs
are emitted on every task start and completion.

`raw.orders`, `raw.customers` → `staging.orders_enriched` → `marts.daily_revenue_by_country`
"""

from __future__ import annotations

from datetime import timedelta

import pendulum
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.sdk import CronDataIntervalTimetable, dag

CONN = "warehouse"
SQL = {
    "seed_raw": """
        CREATE SCHEMA IF NOT EXISTS raw;
        CREATE TABLE IF NOT EXISTS raw.customers (customer_id INT PRIMARY KEY, country TEXT);
        CREATE TABLE IF NOT EXISTS raw.orders (order_id TEXT PRIMARY KEY, customer_id INT,
                                               order_date DATE, amount_usd NUMERIC(12,2));
        INSERT INTO raw.customers
        SELECT g, (ARRAY['CO','MX','US','BR'])[1 + g % 4] FROM generate_series(1, 50) g
        ON CONFLICT (customer_id) DO NOTHING;
        DELETE FROM raw.orders WHERE order_date = DATE '{{ data_interval_start | ds }}';
        INSERT INTO raw.orders
        SELECT '{{ data_interval_start | ds_nodash }}-' || g, 1 + g % 50,
               DATE '{{ data_interval_start | ds }}', round((10 + g * 3.7)::numeric, 2)
        FROM generate_series(1, 200) g;
    """,
    "build_staging": """
        CREATE SCHEMA IF NOT EXISTS staging;
        CREATE TABLE IF NOT EXISTS staging.orders_enriched (order_id TEXT, order_date DATE,
                                                            country TEXT, amount_usd NUMERIC(12,2));
        DELETE FROM staging.orders_enriched WHERE order_date = DATE '{{ data_interval_start | ds }}';
        INSERT INTO staging.orders_enriched (order_id, order_date, country, amount_usd)
        SELECT o.order_id, o.order_date, c.country, o.amount_usd
        FROM raw.orders o JOIN raw.customers c ON o.customer_id = c.customer_id
        WHERE o.order_date = DATE '{{ data_interval_start | ds }}';
    """,
    "build_mart": """
        CREATE SCHEMA IF NOT EXISTS marts;
        CREATE TABLE IF NOT EXISTS marts.daily_revenue_by_country (order_date DATE, country TEXT,
                                                                   orders INT, revenue_usd NUMERIC(14,2));
        DELETE FROM marts.daily_revenue_by_country WHERE order_date = DATE '{{ data_interval_start | ds }}';
        INSERT INTO marts.daily_revenue_by_country (order_date, country, orders, revenue_usd)
        SELECT order_date, country, COUNT(*) AS orders, SUM(amount_usd) AS revenue_usd
        FROM staging.orders_enriched
        WHERE order_date = DATE '{{ data_interval_start | ds }}'
        GROUP BY order_date, country;
    """,
}


@dag(
    dag_id="revenue_lineage",
    schedule=CronDataIntervalTimetable("0 3 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    default_args={"owner": "data-platform", "retries": 1, "retry_delay": timedelta(seconds=30)},
    tags=["level-5", "openlineage", "observability"],
    doc_md=__doc__,
)
def revenue_lineage():
    tasks = [SQLExecuteQueryOperator(task_id=name, conn_id=CONN, sql=sql) for name, sql in SQL.items()]
    tasks[0] >> tasks[1] >> tasks[2]


revenue_lineage()
