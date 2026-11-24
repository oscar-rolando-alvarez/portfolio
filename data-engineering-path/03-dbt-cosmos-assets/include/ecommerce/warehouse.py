"""Warehouse backends: Snowflake for real, DuckDB to run the same logic without an account.

Both follow the same load protocol for one table and one batch, in one session:

    1. DDL      create schema/target if missing; create a TEMPORARY staging table
    2. stage    get the extract into staging (PUT + COPY INTO, or DuckDB COPY)
    3. BEGIN    apply the batch: DELETE+INSERT by _batch_date, or MERGE by key
    4. check    reconcile staging vs target inside the transaction
    5. COMMIT   only if the reconciliation holds, otherwise ROLLBACK and raise
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from include.ecommerce import sql
from include.ecommerce.contracts import TableSpec


class ReconciliationError(RuntimeError):
    pass


@dataclass(frozen=True)
class LoadResult:
    table: str
    batch_date: str
    strategy: str
    staged_rows: int
    expected: int
    actual: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class Warehouse(ABC):
    name: str

    @abstractmethod
    @contextmanager
    def session(self) -> Iterator[Any]:
        """Yield a DB-API cursor bound to one session (temp tables live here)."""

    @abstractmethod
    def copy_into_staging(self, cursor: Any, spec: TableSpec, csv_path: Path, batch_date: str) -> None: ...

    def query(self, statement: str) -> list[tuple]:
        with self.session() as cursor:
            cursor.execute(statement)
            return cursor.fetchall()

    def load_batch(self, spec: TableSpec, csv_path: Path, batch_date: str) -> LoadResult:
        with self.session() as cursor:
            for statement in sql.create_target(spec):
                cursor.execute(statement)
            cursor.execute(sql.create_staging(spec))
            self.copy_into_staging(cursor, spec, csv_path, batch_date)
            cursor.execute(f"SELECT COUNT(*) FROM {sql.staging(spec)}")
            staged = cursor.fetchone()[0]

            cursor.execute("BEGIN")
            try:
                for statement in sql.apply_batch(spec, batch_date):
                    cursor.execute(statement)
                cursor.execute(sql.reconcile(spec, batch_date))
                expected, actual = cursor.fetchone()
                if expected != actual:
                    raise ReconciliationError(
                        f"{spec.name} {batch_date}: expected {expected} rows/keys in target, found {actual}"
                    )
            except Exception:
                cursor.execute("ROLLBACK")
                raise
            cursor.execute("COMMIT")
        return LoadResult(spec.name, batch_date, spec.strategy, staged, expected, actual)


class DuckDBWarehouse(Warehouse):
    """Local stand-in for Snowflake. One file, one writer at a time (hence the pool of 1)."""

    name = "duckdb"

    def __init__(self, path: str | Path):
        self.path = str(path)

    @contextmanager
    def session(self):
        import duckdb

        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        connection = duckdb.connect(self.path)
        try:
            yield connection.cursor()
        finally:
            connection.close()

    def copy_into_staging(self, cursor, spec, csv_path, batch_date):
        cursor.execute(f"COPY {sql.staging(spec)} FROM '{csv_path}' (FORMAT csv, HEADER true)")


class SnowflakeWarehouse(Warehouse):
    """Uses the Airflow Snowflake connection; credentials never live in code."""

    name = "snowflake"

    def __init__(self, conn_id: str = "snowflake_default", stage: str = "raw.landing"):
        self.conn_id = conn_id
        self.stage = stage

    @contextmanager
    def session(self):
        from airflow.providers.snowflake.hooks.snowflake import SnowflakeHook

        connection = SnowflakeHook(snowflake_conn_id=self.conn_id).get_conn()
        try:
            yield connection.cursor()
        finally:
            connection.close()

    def stage_path(self, spec: TableSpec, batch_date: str) -> str:
        return f"@{self.stage}/{spec.name}/date={batch_date}/"

    def copy_into_staging(self, cursor, spec, csv_path, batch_date):
        path = self.stage_path(spec, batch_date)
        cursor.execute(f"CREATE STAGE IF NOT EXISTS {self.stage}")
        # In production the extract already sits in S3 behind an external stage and the PUT disappears.
        cursor.execute(f"PUT 'file://{csv_path}' {path} OVERWRITE = TRUE AUTO_COMPRESS = TRUE")
        # FORCE = TRUE: COPY's load history (64 days) would otherwise SKIP a file it has already
        # loaded, leaving staging empty on a rerun and turning DELETE+INSERT into silent data loss.
        cursor.execute(
            f"COPY INTO {sql.staging(spec)} FROM {path} "
            "FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '\"') "
            "FORCE = TRUE ON_ERROR = ABORT_STATEMENT"
        )


def from_env() -> Warehouse:
    backend = os.getenv("WAREHOUSE_BACKEND", "duckdb").lower()
    if backend == "snowflake":
        return SnowflakeWarehouse(conn_id=os.getenv("SNOWFLAKE_CONN_ID", "snowflake_default"))
    if backend == "duckdb":
        return DuckDBWarehouse(os.getenv("DUCKDB_PATH", "/opt/airflow/data/warehouse.duckdb"))
    raise ValueError(f"WAREHOUSE_BACKEND must be 'duckdb' or 'snowflake', got {backend!r}")
