"""Run the real dbt project against a DuckDB file loaded by the real loader."""

import os
import subprocess
from datetime import date

import duckdb
import pytest

from include.ecommerce import source, warehouse
from include.ecommerce.contracts import TABLES
from include.ecommerce.dbt_config import DBT_EXECUTABLE, DBT_PROJECT_DIR

DAYS = [date(2026, 11, 15), date(2026, 11, 16)]


def load(tmp_path, db, day):
    source.write_extracts(tmp_path, day)
    wh = warehouse.DuckDBWarehouse(db)
    for name, spec in TABLES.items():
        wh.load_batch(spec, source.landing_file(tmp_path, name, day), day.isoformat())


def dbt_build(db, tmp_path):
    env = {**os.environ, "DUCKDB_PATH": str(db), "DBT_TARGET": "local"}
    return subprocess.run(
        [DBT_EXECUTABLE, "build", "--target-path", str(tmp_path / "target"), "--log-path", str(tmp_path)],
        cwd=DBT_PROJECT_DIR,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def db(tmp_path):
    path = tmp_path / "wh.duckdb"
    for day in DAYS:
        load(tmp_path, path, day)
    return path


def scalar(db, sql):
    with duckdb.connect(str(db), read_only=True) as con:
        return con.execute(sql).fetchone()[0]


def test_build_passes_and_incremental_rerun_does_not_duplicate(db, tmp_path):
    first = dbt_build(db, tmp_path)
    assert first.returncode == 0, first.stdout[-3000:]
    second = dbt_build(db, tmp_path)  # incremental path (is_incremental() = true)
    assert second.returncode == 0, second.stdout[-3000:]
    assert scalar(db, "SELECT COUNT(*) FROM analytics_marts.fct_orders") == scalar(
        db, "SELECT COUNT(*) FROM raw.orders"
    )
    revenue = scalar(db, "SELECT SUM(revenue_usd) FROM analytics_marts.mart_daily_revenue")
    paid = scalar(db, "SELECT SUM(amount_usd) FROM raw.payments")
    assert revenue == paid


def test_data_tests_catch_unsettled_payments(db, tmp_path):
    with duckdb.connect(str(db)) as con:
        con.execute(
            "UPDATE raw.payments SET amount_usd = amount_usd - 1 WHERE payment_id IN "
            "(SELECT payment_id FROM raw.payments LIMIT 1)"
        )
    result = dbt_build(db, tmp_path)
    assert result.returncode != 0
    assert "assert_paid_orders_are_fully_settled" in result.stdout
