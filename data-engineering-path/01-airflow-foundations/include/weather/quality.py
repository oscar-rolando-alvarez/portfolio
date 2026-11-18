"""Parse the Open-Meteo CSV and enforce data-quality rules before anything is published."""

from __future__ import annotations

import io
from dataclasses import asdict, dataclass
from datetime import date

import pandas as pd

COLUMN_MAP = {
    "time": "observed_at",
    "temperature_2m (°C)": "temperature_c",
    "relative_humidity_2m (%)": "relative_humidity_pct",
    "precipitation (mm)": "precipitation_mm",
    "wind_speed_10m (km/h)": "wind_speed_kmh",
}

# Physically plausible bounds; anything outside is a source bug, not weather.
RANGES = {
    "temperature_c": (-60.0, 60.0),
    "relative_humidity_pct": (0.0, 100.0),
    "precipitation_mm": (0.0, 300.0),
    "wind_speed_kmh": (0.0, 400.0),
}
EXPECTED_HOURS = 24


class DataQualityError(ValueError):
    """Raised when a batch must not be published. Retrying will not fix it."""


@dataclass(frozen=True)
class QualityReport:
    rows: int
    min_temperature_c: float
    max_temperature_c: float
    total_precipitation_mm: float

    def to_dict(self) -> dict[str, float | int]:
        return asdict(self)


def parse_open_meteo_csv(raw_csv: str) -> pd.DataFrame:
    """Skip the location header block and return a typed, renamed frame."""
    _, _, body = raw_csv.partition("\n\n")
    if not body.strip():
        raise DataQualityError("CSV has no data section")
    frame = pd.read_csv(io.StringIO(body))
    missing = set(COLUMN_MAP) - set(frame.columns)
    if missing:
        raise DataQualityError(f"Schema drift: missing columns {sorted(missing)}")
    frame = frame[list(COLUMN_MAP)].rename(columns=COLUMN_MAP)
    frame["observed_at"] = pd.to_datetime(frame["observed_at"], utc=True)
    return frame


def validate(frame: pd.DataFrame, day: date) -> QualityReport:
    """Fail loudly on incomplete, duplicated, out-of-window or implausible data."""
    problems: list[str] = []
    if len(frame) != EXPECTED_HOURS:
        problems.append(f"expected {EXPECTED_HOURS} hourly rows, got {len(frame)}")
    if frame["observed_at"].duplicated().any():
        problems.append("duplicate timestamps")
    outside = frame[frame["observed_at"].dt.date != day]
    if not outside.empty:
        problems.append(f"{len(outside)} rows fall outside {day.isoformat()}")
    nulls = frame.drop(columns="observed_at").isna().sum()
    for column, count in nulls[nulls > 0].items():
        problems.append(f"{count} null values in {column}")
    for column, (low, high) in RANGES.items():
        bad = frame[(frame[column] < low) | (frame[column] > high)]
        if not bad.empty:
            problems.append(f"{len(bad)} values of {column} outside [{low}, {high}]")
    if problems:
        raise DataQualityError("; ".join(problems))
    return QualityReport(
        rows=len(frame),
        min_temperature_c=float(frame["temperature_c"].min()),
        max_temperature_c=float(frame["temperature_c"].max()),
        total_precipitation_mm=round(float(frame["precipitation_mm"].sum()), 2),
    )
