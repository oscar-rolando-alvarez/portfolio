import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import estimate as e


def test_snowflake_credits_follow_size_and_uptime():
    wh = e.Warehouse("SMALL", busy_hours_per_day=2, resumes_per_day=0)
    assert e.warehouse_credits_per_month(wh) == 2 * 2 * 30
    assert e.warehouse_credits_per_month(replace(wh, size="MEDIUM")) == 2 * e.warehouse_credits_per_month(wh)


def test_resume_minutes_are_billed():
    wh = e.Warehouse("XSMALL", busy_hours_per_day=0, resumes_per_day=60)
    assert e.warehouse_credits_per_month(wh) == 1 * 1 * 30  # 60 one-minute minimums per day


def test_total_is_the_sum_and_scenarios_grow():
    totals = []
    for s in e.SCENARIOS.values():
        c = e.estimate(s)
        assert abs(c["total"] - (c["mwaa"] + c["snowflake"] + c["databricks"] + c["s3"])) < 0.05
        totals.append(c["total"])
    assert totals == sorted(totals)


def test_auto_suspend_and_spot_are_material_levers():
    s = e.SCENARIOS["medium"]
    assert e.estimate(e.always_on(s))["snowflake"] > 3 * e.estimate(s)["snowflake"]
    on_demand = replace(s, databricks_spot_share=0.0)
    assert e.estimate(on_demand)["databricks"] > e.estimate(s)["databricks"]


def test_prices_are_overridable():
    s = e.SCENARIOS["small"]
    double = replace(e.Prices(), snowflake_credit=6.0)
    assert e.estimate(s, double)["snowflake"] == round(2 * e.estimate(s)["snowflake"], 2)
