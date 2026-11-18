"""Table contracts: the single source of truth for schema, keys and load strategy.

Adding a table to the pipeline means adding one entry here; the DAG maps over
this list at runtime (dynamic task mapping), so no DAG code changes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Strategy = Literal["merge", "delete_insert"]


@dataclass(frozen=True)
class Column:
    name: str
    type: str


@dataclass(frozen=True)
class TableSpec:
    name: str
    columns: tuple[Column, ...]
    strategy: Strategy
    keys: tuple[str, ...]
    # Column used to keep the newest version of a row (MERGE only).
    version_column: str | None = None

    @property
    def column_names(self) -> list[str]:
        return [c.name for c in self.columns]


TABLES: dict[str, TableSpec] = {
    # Dimension: mutable rows, upserted by natural key; older versions never win.
    "customers": TableSpec(
        name="customers",
        columns=(
            Column("customer_id", "INTEGER"),
            Column("email", "VARCHAR"),
            Column("country", "VARCHAR"),
            Column("segment", "VARCHAR"),
            Column("updated_at", "TIMESTAMP"),
        ),
        strategy="merge",
        keys=("customer_id",),
        version_column="updated_at",
    ),
    # Facts: immutable events, replaced per load batch (delete + insert by _batch_date).
    "orders": TableSpec(
        name="orders",
        columns=(
            Column("order_id", "VARCHAR"),
            Column("customer_id", "INTEGER"),
            Column("order_ts", "TIMESTAMP"),
            Column("status", "VARCHAR"),
            Column("amount_usd", "DECIMAL(12,2)"),
        ),
        strategy="delete_insert",
        keys=("order_id",),
    ),
    "payments": TableSpec(
        name="payments",
        columns=(
            Column("payment_id", "VARCHAR"),
            Column("order_id", "VARCHAR"),
            Column("method", "VARCHAR"),
            Column("amount_usd", "DECIMAL(12,2)"),
            Column("paid_ts", "TIMESTAMP"),
        ),
        strategy="delete_insert",
        keys=("payment_id",),
    ),
}
