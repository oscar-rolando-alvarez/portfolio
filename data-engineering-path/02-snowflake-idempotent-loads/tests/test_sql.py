from include.ecommerce import sql
from include.ecommerce.contracts import TABLES


def test_facts_are_replaced_per_batch():
    statements = sql.apply_batch(TABLES["orders"], "2026-11-17")
    assert statements[0] == "DELETE FROM raw.orders WHERE _batch_date = DATE '2026-11-17'"
    assert statements[1].startswith("INSERT INTO raw.orders")


def test_dimension_merge_dedupes_and_never_regresses():
    (merge,) = sql.apply_batch(TABLES["customers"], "2026-11-17")
    assert "QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY updated_at DESC) = 1" in merge
    assert "WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE" in merge
    assert "WHEN NOT MATCHED THEN INSERT" in merge


def test_staging_is_session_scoped():
    assert sql.create_staging(TABLES["orders"]).startswith("CREATE OR REPLACE TEMPORARY TABLE stg_orders")
