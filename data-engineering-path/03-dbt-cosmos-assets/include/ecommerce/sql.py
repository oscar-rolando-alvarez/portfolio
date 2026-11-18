"""SQL generation shared by every warehouse backend.

The statements are written in the common subset of Snowflake and DuckDB SQL
(MERGE, QUALIFY, DECIMAL, TIMESTAMP), so the local mode exercises the same
logic that runs in Snowflake. Only the "get a file into staging" step differs.
"""

from __future__ import annotations

from include.ecommerce.contracts import TableSpec

RAW_SCHEMA = "raw"
AUDIT_COLUMNS = (("_batch_date", "DATE"), ("_loaded_at", "TIMESTAMP"))


def target(spec: TableSpec) -> str:
    return f"{RAW_SCHEMA}.{spec.name}"


def staging(spec: TableSpec) -> str:
    # A TEMPORARY table lives only in the loading session. Two runs loading different
    # days at the same time therefore never see (or truncate) each other's staging rows.
    return f"stg_{spec.name}"


def create_target(spec: TableSpec) -> list[str]:
    cols = ", ".join(f"{c.name} {c.type}" for c in spec.columns)
    audit = ", ".join(f"{name} {type_}" for name, type_ in AUDIT_COLUMNS)
    return [
        f"CREATE SCHEMA IF NOT EXISTS {RAW_SCHEMA}",
        f"CREATE TABLE IF NOT EXISTS {target(spec)} ({cols}, {audit})",
    ]


def create_staging(spec: TableSpec) -> str:
    cols = ", ".join(f"{c.name} {c.type}" for c in spec.columns)
    return f"CREATE OR REPLACE TEMPORARY TABLE {staging(spec)} ({cols})"


def apply_batch(spec: TableSpec, batch_date: str) -> list[str]:
    """Statements that move staging into the target. Run them in ONE transaction."""
    if spec.strategy == "delete_insert":
        return _delete_insert(spec, batch_date)
    return [_merge(spec, batch_date)]


def _delete_insert(spec: TableSpec, batch_date: str) -> list[str]:
    cols = ", ".join(spec.column_names)
    return [
        f"DELETE FROM {target(spec)} WHERE _batch_date = DATE '{batch_date}'",
        f"INSERT INTO {target(spec)} ({cols}, _batch_date, _loaded_at) "
        f"SELECT {cols}, DATE '{batch_date}', CURRENT_TIMESTAMP FROM {staging(spec)}",
    ]


def _merge(spec: TableSpec, batch_date: str) -> str:
    keys = spec.keys
    version = spec.version_column
    on = " AND ".join(f"t.{k} = s.{k}" for k in keys)
    non_keys = [c for c in spec.column_names if c not in keys]
    updates = ", ".join(f"{c} = s.{c}" for c in non_keys)
    cols = ", ".join(spec.column_names)
    values = ", ".join(f"s.{c}" for c in spec.column_names)
    partition = ", ".join(keys)
    return (
        f"MERGE INTO {target(spec)} AS t "
        f"USING (SELECT * FROM {staging(spec)} "
        f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {partition} ORDER BY {version} DESC) = 1) AS s "
        f"ON {on} "
        # Only newer versions win: replaying an old batch after a new one cannot regress data.
        f"WHEN MATCHED AND s.{version} > t.{version} THEN UPDATE SET {updates}, "
        f"_batch_date = DATE '{batch_date}', _loaded_at = CURRENT_TIMESTAMP "
        f"WHEN NOT MATCHED THEN INSERT ({cols}, _batch_date, _loaded_at) "
        f"VALUES ({values}, DATE '{batch_date}', CURRENT_TIMESTAMP)"
    )


def reconcile(spec: TableSpec, batch_date: str) -> str:
    """Return (expected, actual): both must match before the transaction commits."""
    if spec.strategy == "delete_insert":
        return (
            f"SELECT (SELECT COUNT(*) FROM {staging(spec)}), "
            f"(SELECT COUNT(*) FROM {target(spec)} WHERE _batch_date = DATE '{batch_date}')"
        )
    keys = ", ".join(spec.keys)
    on = " AND ".join(f"t.{k} = k.{k}" for k in spec.keys)
    return (
        f"SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT {keys} FROM {staging(spec)})), "
        f"(SELECT COUNT(*) FROM {target(spec)} t "
        f"JOIN (SELECT DISTINCT {keys} FROM {staging(spec)}) k ON {on})"
    )
