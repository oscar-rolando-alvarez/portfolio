#!/usr/bin/env python3
"""Monthly cost model for the reference architecture: MWAA + Snowflake + Databricks + S3.

Every price is an explicit, overridable ASSUMPTION (illustrative US-East list prices).
Prices change and enterprise contracts differ: verify against current pricing pages or
your contract before using the numbers in a decision. What the model is for: comparing
scenarios and showing which levers move the bill (warehouse size and uptime, spot vs
on-demand, MWAA class), not producing a quote.

    python estimate.py                 # all scenarios
    python estimate.py --scenario medium --json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field, replace

HOURS_PER_MONTH = 730
DAYS_PER_MONTH = 30
SNOWFLAKE_CREDITS_PER_HOUR = {"XSMALL": 1, "SMALL": 2, "MEDIUM": 4, "LARGE": 8, "XLARGE": 16}


@dataclass(frozen=True)
class Prices:
    """Illustrative list prices in USD. Override them; do not trust them blindly."""

    mwaa_env_per_hour: dict[str, float] = field(
        default_factory=lambda: {"mw1.small": 0.49, "mw1.medium": 0.74, "mw1.large": 0.99}
    )
    mwaa_worker_per_hour: dict[str, float] = field(
        default_factory=lambda: {"mw1.small": 0.055, "mw1.medium": 0.11, "mw1.large": 0.22}
    )
    snowflake_credit: float = 3.00  # Enterprise edition, on-demand
    databricks_dbu_jobs: float = 0.15  # Jobs Compute (classic), per DBU
    dbu_per_node_hour: float = 1.0  # depends on instance type
    ec2_node_per_hour: float = 0.23  # e.g. a 4 vCPU / 16 GiB Graviton instance, on-demand
    spot_discount: float = 0.60  # typical, not guaranteed
    s3_gb_month: float = 0.023


@dataclass(frozen=True)
class Warehouse:
    size: str
    busy_hours_per_day: float
    # auto_suspend = 60 s bills ~1 extra minute per resume; resumes/day * 1 min
    resumes_per_day: int = 24


@dataclass(frozen=True)
class Scenario:
    name: str
    mwaa_class: str
    mwaa_avg_extra_workers: float
    warehouses: dict[str, Warehouse]
    databricks_node_hours_per_day: float
    databricks_spot_share: float
    lake_tb: float


SCENARIOS = {
    "small": Scenario(
        "small",
        "mw1.small",
        0.5,
        {"LOAD": Warehouse("XSMALL", 1), "TRANSFORM": Warehouse("XSMALL", 1.5), "BI": Warehouse("XSMALL", 3)},
        databricks_node_hours_per_day=6,
        databricks_spot_share=0.7,
        lake_tb=2,
    ),
    "medium": Scenario(
        "medium",
        "mw1.medium",
        2,
        {"LOAD": Warehouse("XSMALL", 3), "TRANSFORM": Warehouse("SMALL", 4), "BI": Warehouse("SMALL", 8)},
        databricks_node_hours_per_day=40,
        databricks_spot_share=0.7,
        lake_tb=20,
    ),
    "large": Scenario(
        "large",
        "mw1.large",
        6,
        {"LOAD": Warehouse("SMALL", 6), "TRANSFORM": Warehouse("MEDIUM", 8), "BI": Warehouse("MEDIUM", 12)},
        databricks_node_hours_per_day=200,
        databricks_spot_share=0.8,
        lake_tb=200,
    ),
}


def warehouse_credits_per_month(wh: Warehouse) -> float:
    hours = wh.busy_hours_per_day + wh.resumes_per_day / 60  # one billed minute per resume
    return SNOWFLAKE_CREDITS_PER_HOUR[wh.size] * hours * DAYS_PER_MONTH


def estimate(s: Scenario, p: Prices = Prices()) -> dict[str, float]:
    mwaa = HOURS_PER_MONTH * (
        p.mwaa_env_per_hour[s.mwaa_class] + s.mwaa_avg_extra_workers * p.mwaa_worker_per_hour[s.mwaa_class]
    )
    snowflake = sum(warehouse_credits_per_month(wh) for wh in s.warehouses.values()) * p.snowflake_credit
    node_hours = s.databricks_node_hours_per_day * DAYS_PER_MONTH
    ec2_rate = p.ec2_node_per_hour * (1 - s.databricks_spot_share * p.spot_discount)
    databricks = node_hours * (p.dbu_per_node_hour * p.databricks_dbu_jobs + ec2_rate)
    s3 = s.lake_tb * 1024 * p.s3_gb_month
    costs = {"mwaa": mwaa, "snowflake": snowflake, "databricks": databricks, "s3": s3}
    costs = {k: round(v, 2) for k, v in costs.items()}
    costs["total"] = round(sum(costs.values()), 2)
    return costs


def always_on(s: Scenario) -> Scenario:
    """Counterfactual: warehouses never suspend (what auto_suspend saves)."""
    return replace(
        s,
        warehouses={k: replace(w, busy_hours_per_day=24, resumes_per_day=0) for k, w in s.warehouses.items()},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--scenario", choices=sorted(SCENARIOS))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    names = [args.scenario] if args.scenario else list(SCENARIOS)
    results = {n: estimate(SCENARIOS[n]) for n in names}
    if args.json:
        print(json.dumps({"assumptions": asdict(Prices()), "monthly_usd": results}, indent=2))
        return
    print(f"{'scenario':<8} {'mwaa':>9} {'snowflake':>10} {'databricks':>11} {'s3':>8} {'total':>10}")
    for n, c in results.items():
        row = [c[k] for k in ("mwaa", "snowflake", "databricks", "s3", "total")]
        print(f"{n:<8} {row[0]:>9,.0f} {row[1]:>10,.0f} {row[2]:>11,.0f} {row[3]:>8,.0f} {row[4]:>10,.0f}")
        saved = estimate(always_on(SCENARIOS[n]))["snowflake"] - c["snowflake"]
        print(f"{'':<8} auto-suspend saves ~${saved:,.0f}/month on Snowflake vs. always-on warehouses")
    print("\nIllustrative list-price ASSUMPTIONS; verify current pricing before deciding.")


if __name__ == "__main__":
    main()
