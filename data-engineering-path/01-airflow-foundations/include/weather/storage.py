"""Date-partitioned, idempotent storage on a local filesystem (S3 in production).

Layout (Hive-style partitions, readable by Spark, DuckDB, Athena, Snowflake external tables):

    raw/weather/city=<city>/date=<YYYY-MM-DD>/hourly.csv
    curated/weather/city=<city>/date=<YYYY-MM-DD>/hourly.parquet

Every write goes to a temporary file first and is then renamed into place, so a
crashed or retried task never leaves a half-written partition, and re-running
the same day overwrites the partition instead of appending duplicates.
"""

from __future__ import annotations

import os
import tempfile
from datetime import date
from pathlib import Path

import pandas as pd


def data_root() -> Path:
    return Path(os.getenv("DATA_ROOT", "/opt/airflow/data"))


def partition_dir(zone: str, city: str, day: date, root: Path | None = None) -> Path:
    return (root or data_root()) / zone / "weather" / f"city={city}" / f"date={day.isoformat()}"


def _atomic_write(target: Path, write) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp")
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        write(tmp)
        tmp.replace(target)  # atomic on POSIX within one filesystem
    finally:
        tmp.unlink(missing_ok=True)
    return target


def write_raw(raw_csv: str, city: str, day: date, root: Path | None = None) -> Path:
    target = partition_dir("raw", city, day, root) / "hourly.csv"
    return _atomic_write(target, lambda tmp: tmp.write_text(raw_csv, encoding="utf-8"))


def write_curated(frame: pd.DataFrame, city: str, day: date, root: Path | None = None) -> Path:
    target = partition_dir("curated", city, day, root) / "hourly.parquet"
    enriched = frame.assign(city=city)
    return _atomic_write(target, lambda tmp: enriched.to_parquet(tmp, index=False))
