"""The idempotency contract, proven against a real (embedded) SQL engine."""

from datetime import date

import pytest

from include.ecommerce import source, sql, warehouse
from include.ecommerce.contracts import TABLES

DAY1, DAY2 = date(2026, 11, 16), date(2026, 11, 17)


def load_day(wh, root, day):
    source.write_extracts(root, day)
    return {
        name: wh.load_batch(spec, source.landing_file(root, name, day), day.isoformat())
        for name, spec in TABLES.items()
    }


def snapshot(wh):
    return {
        name: wh.query(f"SELECT * FROM raw.{name} ORDER BY ALL")
        for name in TABLES
        # _loaded_at changes on every run by design; compare business columns only
    } | {
        f"{name}_business": wh.query(
            f"SELECT {', '.join(spec.column_names)}, _batch_date FROM raw.{name} ORDER BY ALL"
        )
        for name, spec in TABLES.items()
    }


@pytest.fixture
def wh(tmp_path):
    return warehouse.DuckDBWarehouse(tmp_path / "wh.duckdb")


def test_facts_match_the_extract_exactly(wh, tmp_path):
    results = load_day(wh, tmp_path, DAY1)
    expected = source.generate_day(DAY1)
    assert results["orders"].actual == len(expected["orders"])
    assert results["payments"].actual == len(expected["payments"])


def test_rerun_and_out_of_order_backfill_are_no_ops(wh, tmp_path):
    load_day(wh, tmp_path, DAY1)
    load_day(wh, tmp_path, DAY2)
    before = {k: v for k, v in snapshot(wh).items() if k.endswith("_business")}
    load_day(wh, tmp_path, DAY2)  # plain rerun
    load_day(wh, tmp_path, DAY1)  # replay an OLDER day after a newer one
    after = {k: v for k, v in snapshot(wh).items() if k.endswith("_business")}
    assert after == before


def test_customers_are_upserted_not_duplicated(wh, tmp_path):
    load_day(wh, tmp_path, DAY1)
    load_day(wh, tmp_path, DAY2)
    (dupes,) = wh.query("SELECT COUNT(*) - COUNT(DISTINCT customer_id) FROM raw.customers")[0]
    assert dupes == 0
    # the extract contains the same customer twice; the newest version (segment=enterprise) wins
    last = source.generate_day(DAY2)["customers"][-1]
    (segment,) = wh.query(f"SELECT segment FROM raw.customers WHERE customer_id = {last['customer_id']}")[0]
    assert segment == "enterprise"


def test_failed_reconciliation_rolls_back(wh, tmp_path, monkeypatch):
    load_day(wh, tmp_path, DAY1)
    before = wh.query("SELECT COUNT(*) FROM raw.orders")

    real = sql.apply_batch

    def buggy(spec, batch_date):  # a bug that inserts every row twice
        statements = real(spec, batch_date)
        return statements + statements[1:] if spec.strategy == "delete_insert" else statements

    monkeypatch.setattr(sql, "apply_batch", buggy)
    with pytest.raises(warehouse.ReconciliationError):
        wh.load_batch(TABLES["orders"], source.landing_file(tmp_path, "orders", DAY1), DAY1.isoformat())
    assert wh.query("SELECT COUNT(*) FROM raw.orders") == before
