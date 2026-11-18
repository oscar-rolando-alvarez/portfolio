"""The Snowflake backend, exercised against a recording fake connection (no account needed)."""

from datetime import date
from pathlib import Path

import pytest

from include.ecommerce import warehouse
from include.ecommerce.contracts import TABLES


class FakeCursor:
    def __init__(self):
        self.statements: list[str] = []

    def execute(self, statement):
        self.statements.append(" ".join(statement.split()))

    def fetchone(self):
        return (10, 10) if self.statements[-1].startswith("SELECT (SELECT") else (10,)


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.closed = False

    def cursor(self):
        return self._cursor

    def close(self):
        self.closed = True


@pytest.fixture
def fake_snowflake(monkeypatch):
    cursor = FakeCursor()
    connection = FakeConnection(cursor)

    class FakeHook:
        def __init__(self, snowflake_conn_id):
            assert snowflake_conn_id == "snowflake_default"

        def get_conn(self):
            return connection

    from airflow.providers.snowflake.hooks import snowflake

    monkeypatch.setattr(snowflake, "SnowflakeHook", FakeHook)
    return cursor, connection


def test_load_protocol_order_and_options(fake_snowflake):
    cursor, connection = fake_snowflake
    result = warehouse.SnowflakeWarehouse().load_batch(
        TABLES["orders"], Path("/data/landing/orders/date=2026-11-17/orders.csv"), "2026-11-17"
    )
    s = cursor.statements
    begin = s.index("BEGIN")
    put = next(i for i, x in enumerate(s) if x.startswith("PUT"))
    copy = next(i for i, x in enumerate(s) if x.startswith("COPY INTO stg_orders"))
    # DDL and staging happen before BEGIN: in Snowflake, DDL would implicitly commit a transaction.
    assert put < copy < begin
    assert "FORCE = TRUE" in s[copy]
    assert "@raw.landing/orders/date=2026-11-17/" in s[put]
    assert s[-1] == "COMMIT"
    assert result.actual == result.expected == 10
    assert connection.closed


def test_backend_selection(monkeypatch):
    monkeypatch.setenv("WAREHOUSE_BACKEND", "snowflake")
    assert isinstance(warehouse.from_env(), warehouse.SnowflakeWarehouse)
    monkeypatch.setenv("WAREHOUSE_BACKEND", "oracle")
    with pytest.raises(ValueError):
        warehouse.from_env()


def test_source_is_deterministic():
    from include.ecommerce import source

    day = date(2026, 11, 17)
    assert source.generate_day(day) == source.generate_day(day)
