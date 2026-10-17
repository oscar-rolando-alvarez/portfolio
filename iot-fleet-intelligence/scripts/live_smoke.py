#!/usr/bin/env python3
"""End-to-end check of the real-time path (used by `make demo-ui-check` and CI).

simulator -> Kafka -> gateway (per-second aggregates, live anomaly) -> SSE
            Kafka -> platform (detect, enrich, bilingual diagnosis) -> API -> gateway -> SSE
dashboard /api/stream proxy -> gateway SSE

Stdlib only. Exits non-zero with a message on the first failed expectation.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from collections.abc import Callable
from typing import Any


def get(url: str, key: str | None, timeout: float = 5.0) -> bytes:
    req = urllib.request.Request(url, headers={"x-api-key": key} if key else {})  # noqa: S310 - local URLs
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        return resp.read()


def sse_events(url: str, key: str | None, seconds: float) -> list[tuple[str, Any]]:
    """Read an SSE stream for a few seconds and return (event, data) pairs."""
    req = urllib.request.Request(url, headers={"x-api-key": key} if key else {})  # noqa: S310
    events: list[tuple[str, Any]] = []
    deadline = time.monotonic() + seconds
    event = ""
    with urllib.request.urlopen(req, timeout=seconds + 5) as resp:  # noqa: S310
        while time.monotonic() < deadline:
            line = resp.readline().decode().rstrip("\n")
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: ") and event:
                events.append((event, json.loads(line[6:])))
                if len(events) >= 3:
                    break
    return events


def wait(what: str, timeout: float, check: Callable[[], Any]) -> Any:
    start = time.monotonic()
    last_err = ""
    while time.monotonic() - start < timeout:
        try:
            value = check()
            if value:
                print(f"ok   {what} ({time.monotonic() - start:.0f}s)")
                return value
        except Exception as exc:  # noqa: BLE001 - keep polling while the stack warms up
            last_err = str(exc)
        time.sleep(2)
    sys.exit(f"FAIL {what} within {timeout:.0f}s {last_err}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gateway", default="http://localhost:8090")
    ap.add_argument("--dashboard", default="")
    ap.add_argument("--key", default="demo-key-acme")
    ap.add_argument("--timeout", type=float, default=300)
    a = ap.parse_args()

    def snapshot() -> dict[str, Any]:
        return json.loads(get(f"{a.gateway}/v1/snapshot", a.key))

    wait("gateway aggregates telemetry", 120, lambda: snapshot()["eventsPerSec"] > 0)
    snap = wait(
        "live anomaly signal on the outage cells",
        a.timeout,
        lambda: next((x for x in snapshot()["anomalies"] if x["kind"] == "cell_outage"), None),
    )
    print(f"     {snap['scope']} score={snap['score']} z={snap['z']}")

    def incident() -> dict[str, Any] | None:
        hello = next(d for e, d in sse_events(f"{a.gateway}/v1/stream?cells=0", a.key, 3) if e == "hello")
        for v in hello["incidents"]:
            d = v.get("diagnosis") or {}
            if v["incident"]["suspected_fault"] == "cell_outage" and "es" in d and "en" in d:
                return v
        return None

    v = wait("confirmed incident with EN + ES diagnosis streamed over SSE", a.timeout, incident)
    es = v["diagnosis"]["es"]["diagnosis"]
    print(f"     {v['incident']['incident_id']} lead={v['detection'].get('leadSeconds')}s")
    print(f"     es: {es['summary']}")
    if v["diagnosis"]["en"]["diagnosis"]["root_cause"] != "cell_outage" or not es["summary"].startswith("Posible"):
        sys.exit("FAIL diagnosis content")

    if a.dashboard:
        cfg = json.loads(get(f"{a.dashboard}/api/config", None))
        if not cfg.get("liveAvailable"):
            sys.exit("FAIL dashboard does not see the gateway")
        events = sse_events(f"{a.dashboard}/api/stream?tenant=acme-utilities", None, 4)
        kinds = {e for e, _ in events}
        if not {"hello", "snapshot"} <= kinds:
            sys.exit(f"FAIL dashboard SSE proxy returned {sorted(kinds)}")
        print("ok   dashboard proxies the live stream (API key stays server-side)")
    print("live path OK")


if __name__ == "__main__":
    main()
