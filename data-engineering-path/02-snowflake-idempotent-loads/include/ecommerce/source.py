"""A deterministic fake source system that drops one CSV extract per table per day.

Layout of the landing zone (a local folder here, an S3 prefix in production):

    landing/<table>/date=<YYYY-MM-DD>/<table>.csv
    landing/_SUCCESS/date=<YYYY-MM-DD>     <- written last: "the extract is complete"

The same day always produces the same rows (seeded by date), which is what lets
tests assert exact counts after reruns and backfills.
"""

from __future__ import annotations

import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from include.ecommerce.contracts import TABLES

COUNTRIES = ("CO", "MX", "US", "BR", "ES")
SEGMENTS = ("consumer", "smb", "enterprise")
METHODS = ("card", "pse", "wallet")
BASE_DAY = date(2026, 1, 1)
NEW_CUSTOMERS_PER_DAY = 20


def landing_file(root: Path, table: str, day: date) -> Path:
    return root / "landing" / table / f"date={day.isoformat()}" / f"{table}.csv"


def success_marker(root: Path, day: date) -> Path:
    return root / "landing" / "_SUCCESS" / f"date={day.isoformat()}"


def generate_day(day: date) -> dict[str, list[dict]]:
    rng = random.Random(day.toordinal())
    day_index = max((day - BASE_DAY).days, 0)
    start = datetime(day.year, day.month, day.day)

    customers = []
    first_new = day_index * NEW_CUSTOMERS_PER_DAY + 1
    for customer_id in range(first_new, first_new + NEW_CUSTOMERS_PER_DAY):
        customers.append(_customer(rng, customer_id, start + timedelta(minutes=rng.randint(0, 1439))))
    # A few existing customers change segment or email: these must be upserted, not duplicated.
    # One of them appears twice in the same extract (CDC noise); the newest version must win.
    if first_new > 1:
        for customer_id in rng.sample(range(1, first_new), k=min(5, first_new - 1)):
            customers.append(_customer(rng, customer_id, start + timedelta(hours=rng.randint(0, 22))))
        dup = dict(customers[-1])
        dup["updated_at"] = (datetime.fromisoformat(dup["updated_at"]) + timedelta(minutes=30)).isoformat(
            sep=" "
        )
        dup["segment"] = "enterprise"
        customers.append(dup)

    orders, payments = [], []
    known_customers = first_new + NEW_CUSTOMERS_PER_DAY - 1
    todays_customers = sorted({c["customer_id"] for c in customers})
    for n in range(rng.randint(80, 120)):
        order_id = f"O-{day:%Y%m%d}-{n:04d}"
        amount = round(rng.uniform(5, 500), 2)
        ts = start + timedelta(seconds=rng.randint(0, 86399))
        status = rng.choices(("paid", "pending", "cancelled"), weights=(80, 15, 5))[0]
        orders.append(
            {
                "order_id": order_id,
                # Most orders come from customers in today's extract; ~10% reference older
                # customers that this extract does not carry (late-arriving dimension).
                "customer_id": (
                    rng.choice(todays_customers) if rng.random() < 0.9 else rng.randint(1, known_customers)
                ),
                "order_ts": ts.isoformat(sep=" "),
                "status": status,
                "amount_usd": f"{amount:.2f}",
            }
        )
        if status == "paid":
            payments.append(
                {
                    "payment_id": f"P-{order_id[2:]}",
                    "order_id": order_id,
                    "method": rng.choice(METHODS),
                    "amount_usd": f"{amount:.2f}",
                    "paid_ts": (ts + timedelta(minutes=rng.randint(1, 30))).isoformat(sep=" "),
                }
            )
    return {"customers": customers, "orders": orders, "payments": payments}


def _customer(rng: random.Random, customer_id: int, updated_at: datetime) -> dict:
    return {
        "customer_id": customer_id,
        "email": f"customer{customer_id}+{rng.randint(1, 9999)}@example.com",
        "country": rng.choice(COUNTRIES),
        "segment": rng.choice(SEGMENTS),
        "updated_at": updated_at.isoformat(sep=" "),
    }


def write_extracts(root: Path, day: date) -> dict[str, int]:
    """Write all table extracts, then the _SUCCESS marker. Safe to rerun."""
    counts = {}
    for table, rows in generate_day(day).items():
        target = landing_file(root, table, day)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".tmp")
        with tmp.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=TABLES[table].column_names)
            writer.writeheader()
            writer.writerows(rows)
        tmp.replace(target)
        counts[table] = len(rows)
    marker = success_marker(root, day)
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.touch()
    return counts
