"""Download hourly weather for one city and one day from the public Open-Meteo API.

Two modes, selected with the ``WEATHER_SOURCE_MODE`` environment variable:

* ``api`` (default): call https://api.open-meteo.com (no API key needed).
* ``fixture``: return a bundled sample re-dated to the requested day, so the
  pipeline and its tests run fully offline (CI, planes, flaky Wi-Fi).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests

API_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARIABLES = ("temperature_2m", "relative_humidity_2m", "precipitation", "wind_speed_10m")
FIXTURE = Path(__file__).parent / "sample_open_meteo.csv"
FIXTURE_DAY = "2026-11-17"


@dataclass(frozen=True)
class City:
    name: str
    latitude: float
    longitude: float


CITIES: dict[str, City] = {
    "bogota": City("bogota", 4.711, -74.0721),
    "medellin": City("medellin", 6.2442, -75.5812),
    "new_york": City("new_york", 40.7128, -74.0060),
}


def source_mode() -> str:
    mode = os.getenv("WEATHER_SOURCE_MODE", "api").lower()
    if mode not in {"api", "fixture"}:
        raise ValueError(f"WEATHER_SOURCE_MODE must be 'api' or 'fixture', got {mode!r}")
    return mode


def build_params(city: City, day: date) -> dict[str, str]:
    return {
        "latitude": str(city.latitude),
        "longitude": str(city.longitude),
        "start_date": day.isoformat(),
        "end_date": day.isoformat(),
        "hourly": ",".join(HOURLY_VARIABLES),
        "timezone": "UTC",
        "format": "csv",
    }


def fetch_hourly_csv(city: City, day: date, *, mode: str | None = None, timeout: float = 30.0) -> str:
    """Return the raw CSV text exactly as the source produced it."""
    mode = mode or source_mode()
    if mode == "fixture":
        return FIXTURE.read_text(encoding="utf-8").replace(FIXTURE_DAY, day.isoformat())
    response = requests.get(API_URL, params=build_params(city, day), timeout=timeout)
    response.raise_for_status()
    return response.text
