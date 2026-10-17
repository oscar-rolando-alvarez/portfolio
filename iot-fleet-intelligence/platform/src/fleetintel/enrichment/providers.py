"""Enrichment provider adapters: live HTTP clients and deterministic fakes.

Live adapters talk to public APIs (Open-Meteo needs no key; OpenCelliD needs a
free key; any Statuspage-compatible JSON feed). Fakes are deterministic so the
pipeline, tests and evals run offline.
"""

from __future__ import annotations

import hashlib
import json
from importlib import resources
from typing import Any

import httpx

_COUNTRY_BOXES: dict[str, tuple[float, float, float, float]] = {
    # mcc: (lat_min, lat_max, lon_min, lon_max) - coarse bounding boxes
    "310": (33.0, 45.0, -118.0, -77.0),
    "262": (47.5, 54.5, 6.5, 14.5),
    "234": (50.5, 55.5, -4.5, 1.0),
    "208": (43.5, 50.5, -1.0, 7.0),
    "222": (38.0, 45.5, 8.0, 16.0),
}

# Static MCC/MNC registry. Operator names are deliberately generic: this repo
# makes no claims about real carriers. Replace with your own registry export.
PLMN_REGISTRY: dict[str, dict[str, str]] = {
    "310260": {"country": "US", "operator": "Home network (US)"},
    "26201": {"country": "DE", "operator": "Roaming partner DE-1"},
    "23415": {"country": "GB", "operator": "Roaming partner GB-1"},
    "20801": {"country": "FR", "operator": "Roaming partner FR-1"},
    "22210": {"country": "IT", "operator": "Roaming partner IT-1"},
}


class ProviderNotConfiguredError(RuntimeError):
    pass


def _unit(seed: str, salt: str) -> float:
    h = hashlib.sha256(f"{salt}:{seed}".encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def parse_cell_id(cell_id: str) -> tuple[str, str, int, int]:
    mcc, mnc, tac, eci = cell_id.split("-")
    return mcc, mnc, int(tac), int(eci)


def hash32(text: str) -> int:
    """32-bit FNV-1a + murmur3 finalizer over UTF-8 bytes.

    Trivially portable (the dashboard has a TypeScript twin); the finalizer fixes
    FNV's weak avalanche on the last byte so neighbouring cell ids spread out.
    """
    h = 0x811C9DC5
    for b in text.encode():
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def _u32(seed: str, salt: str) -> float:
    return hash32(f"{salt}:{seed}") / 2**32


def site_location(cell_id: str) -> tuple[float, float]:
    """Deterministic pseudo-geolocation of a cell site.

    Cells of one tracking area (TAC) cluster around a metro-sized centre inside
    the country box, like real radio planning; each site is jittered around it.
    Golden vectors in tests keep the dashboard's TypeScript port identical.
    """
    mcc, mnc, tac, _ = parse_cell_id(cell_id)
    lat0, lat1, lon0, lon1 = _COUNTRY_BOXES.get(mcc, (0.0, 1.0, 0.0, 1.0))
    area = f"{mcc}-{mnc}-{tac}"
    clat = lat0 + (lat1 - lat0) * (0.1 + 0.8 * _u32(area, "tac-lat"))
    clon = lon0 + (lon1 - lon0) * (0.1 + 0.8 * _u32(area, "tac-lon"))
    lat = clat + (_u32(cell_id, "lat") - 0.5) * 0.8
    lon = clon + (_u32(cell_id, "lon") - 0.5) * 1.1
    return round(lat, 4), round(lon, 4)


# --------------------------------------------------------------------- fakes
class HashedCellTowers:
    """Deterministic pseudo-geolocation: sites clustered per tracking area."""

    name = "celltower"

    def locate(self, cell_id: str) -> dict[str, Any]:
        _, _, tac, _ = parse_cell_id(cell_id)
        lat, lon = site_location(cell_id)
        return {
            "lat": lat,
            "lon": lon,
            "range_m": int(800 + 4200 * _unit(cell_id, "range")),
            "tac": tac,
            "source": "fixture",
        }


class FixtureWeather:
    """Deterministic, mostly benign weather keyed by rounded coordinates."""

    name = "weather"

    def current(self, lat: float, lon: float) -> dict[str, Any]:
        key = f"{lat:.2f},{lon:.2f}"
        wind = round(5 + 35 * _unit(key, "wind"), 1)
        return {
            "temperature_c": round(-2 + 28 * _unit(key, "temp"), 1),
            "precipitation_mm": round(max(0.0, 6 * _unit(key, "rain") - 3), 1),
            "wind_speed_kmh": wind,
            "wind_gusts_kmh": round(wind * 1.6, 1),
            "weather_code": 3 if wind < 25 else 61,
            "severe": False,
            "source": "fixture",
        }


class FixtureStatusFeed:
    """Recorded Statuspage-format feed shipped with the package."""

    name = "status_feed"

    def active_incidents(self) -> list[dict[str, Any]]:
        raw = (
            resources.files("fleetintel.enrichment")
            .joinpath("fixtures/status_feed.json")
            .read_text()
        )
        return normalize_statuspage(json.loads(raw))


class StaticCarrierRegistry:
    """Carrier/roaming lookup from a static MCC-MNC registry (no public API exists)."""

    name = "carrier"

    def __init__(self, allowed_visited: set[str] | None = None) -> None:
        # Tenant roaming agreements (steering list). Default: every partner allowed.
        self.allowed = (
            allowed_visited if allowed_visited is not None else set(PLMN_REGISTRY) - {"310260"}
        )

    def lookup(self, plmn: str, home_plmn: str | None = None) -> dict[str, Any]:
        info = PLMN_REGISTRY.get(plmn, {"country": "unknown", "operator": "unknown"})
        out: dict[str, Any] = {"plmn": plmn, **info}
        if home_plmn and plmn != home_plmn:
            out["roaming_agreement"] = plmn in self.allowed
            out["home_plmn"] = home_plmn
        return out


# --------------------------------------------------------------------- live
class OpenMeteoWeather:
    name = "weather"

    def __init__(self, client: httpx.Client, url: str) -> None:
        self.client = client
        self.url = url

    def current(self, lat: float, lon: float) -> dict[str, Any]:
        resp = self.client.get(
            self.url,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code",
            },
        )
        resp.raise_for_status()
        cur = resp.json()["current"]
        gusts = float(cur.get("wind_gusts_10m", 0))
        code = int(cur.get("weather_code", 0))
        return {
            "temperature_c": cur.get("temperature_2m"),
            "precipitation_mm": cur.get("precipitation"),
            "wind_speed_kmh": cur.get("wind_speed_10m"),
            "wind_gusts_kmh": gusts,
            "weather_code": code,
            # WMO codes 95-99 = thunderstorm; gusts > 75 km/h can down sites/backhaul
            "severe": code >= 95 or gusts > 75,
            "source": "open-meteo",
        }


class OpenCelliDTowers:
    name = "celltower"

    def __init__(self, client: httpx.Client, url: str, api_key: str) -> None:
        self.client = client
        self.url = url
        self.api_key = api_key

    def locate(self, cell_id: str) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderNotConfiguredError("FLEETINTEL_OPENCELLID_API_KEY is not set")
        mcc, mnc, tac, eci = parse_cell_id(cell_id)
        resp = self.client.get(
            self.url,
            params={
                "key": self.api_key,
                "mcc": mcc,
                "mnc": mnc,
                "lac": tac,
                "cellid": eci,
                "format": "json",
            },
        )
        resp.raise_for_status()
        body = resp.json()
        if "lat" not in body:
            raise LookupError(f"cell {cell_id} not found")
        return {
            "lat": float(body["lat"]),
            "lon": float(body["lon"]),
            "range_m": int(body.get("range", 0)),
            "tac": tac,
            "source": "opencellid",
        }


class StatuspageFeed:
    name = "status_feed"

    def __init__(self, client: httpx.Client, url: str) -> None:
        self.client = client
        self.url = url

    def active_incidents(self) -> list[dict[str, Any]]:
        if not self.url:
            raise ProviderNotConfiguredError("FLEETINTEL_STATUS_FEED_URL is not set")
        resp = self.client.get(self.url)
        resp.raise_for_status()
        return normalize_statuspage(resp.json())


def normalize_statuspage(body: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for inc in body.get("incidents", [])[:20]:
        updates = inc.get("incident_updates") or [{}]
        out.append(
            {
                "id": str(inc.get("id", ""))[:64],
                "name": str(inc.get("name", ""))[:200],
                "status": str(inc.get("status", ""))[:32],
                "impact": str(inc.get("impact", ""))[:32],
                "components": [str(c.get("name", ""))[:80] for c in inc.get("components", [])][:10],
                "latest_update": str(updates[0].get("body", ""))[:400],
                "created_at": str(inc.get("created_at", ""))[:40],
            }
        )
    return out
