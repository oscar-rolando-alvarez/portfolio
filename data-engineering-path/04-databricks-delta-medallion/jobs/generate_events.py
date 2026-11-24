"""Deterministic clickstream generator (stands in for the app's event collector).

Plain Python, no Spark: the Airflow task imports it to land the day's JSON lines.
Injects the mess real streams have: ~3% duplicates, ~1% malformed records and
~2% late events that belong to the previous day.
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

PAGES = ("/", "/search", "/product", "/cart", "/checkout")
OS = ("ios", "android", "web")


def generate(day: date, sessions: int = 150) -> list[str]:
    rng = random.Random(day.toordinal())
    start = datetime(day.year, day.month, day.day)
    lines: list[str] = []
    for s in range(sessions):
        user = f"u{rng.randint(1, 400):04d}"
        session = f"s-{day:%Y%m%d}-{s:04d}"
        ts = start + timedelta(seconds=rng.randint(0, 86000))
        if rng.random() < 0.02:  # late: an event from yesterday, delivered today
            ts -= timedelta(days=1)
        device = {"os": rng.choice(OS), "app_version": f"5.{rng.randint(0, 3)}"}
        funnel = ["page_view"] * rng.randint(1, 5)
        if rng.random() < 0.4:
            funnel.append("add_to_cart")
            if rng.random() < 0.6:
                funnel += ["checkout", "purchase"]
        for i, event_type in enumerate(funnel):
            event = {
                "event_id": f"e-{day:%Y%m%d}-{s:04d}-{i:02d}",
                "user_id": user,
                "session_id": session,
                "event_type": event_type,
                "ts": (ts + timedelta(seconds=20 * i)).isoformat(),
                "page": rng.choice(PAGES),
                "amount_usd": round(rng.uniform(10, 300), 2) if event_type == "purchase" else None,
                "device": device,
            }
            lines.append(json.dumps(event))
            if rng.random() < 0.03:  # at-least-once delivery: duplicate
                lines.append(json.dumps(event))
    for _ in range(max(1, len(lines) // 100)):  # ~1% broken records
        lines.insert(
            rng.randrange(len(lines)), rng.choice(['{"event_id": null}', "not json", '{"ts": "yesterday"}'])
        )
    return lines


def write(lake_root: str | Path, day: date) -> Path:
    target = Path(lake_root) / "landing" / "events" / f"date={day.isoformat()}" / "events.jsonl"
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(".events.jsonl.tmp")  # Spark ignores dot-files if a write is interrupted
    tmp.write_text("\n".join(generate(day)) + "\n", encoding="utf-8")
    tmp.replace(target)
    return target
