from __future__ import annotations

import json
from decimal import Decimal as D  # noqa: N817

import pytest
from pydantic import ValidationError

from fleetintel.cost.cli import main as cost_cli
from fleetintel.cost.model import CostReport, FleetProfile, estimate, load_pricing, money, tiered
from fleetintel.cost.report import render_full_report

# A deliberately minimal profile whose every line item is hand-computable:
# 1,000 devices x 1 reading/hour x 730 h = 730,000 readings of 1,000 B.
MINIMAL = FleetProfile(
    devices=1000,
    report_interval_seconds=3600,
    payload_bytes=1000,
    incidents_per_1k_devices_per_day=D(0),
    api_requests_per_month=0,
    kms_keys=0,
    sqs_pollers_per_queue=0,
    log_bytes_per_stream_invocation=0,
    xray_sampling=D(0),
)


def item(r: CostReport, name: str) -> D:
    return next(i.rounded() for i in r.line_items if i.item == name)


def test_pricing_table_is_versioned_and_sourced() -> None:
    p = load_pricing()
    assert p["version"] == "2026-10-01" and p["region"] == "us-east-1"
    assert set(p["sources"]) >= {"iot_core", "msk_serverless", "lambda", "dynamodb"}


def test_minimal_profile_exact_line_items() -> None:
    r = estimate(MINIMAL, with_recommendations=False)
    assert r.volumes["readings"] == D(730_000)
    assert item(r, "Connectivity") == D("3.50")  # 43.8M connection-minutes x $0.08/M
    assert item(r, "Messaging (5 KB units, tiered)") == D("0.73")  # 0.73M units x $1.00/M
    assert item(r, "Rules triggered") == D("0.11")  # 0.73M x $0.15/M = 0.1095
    assert item(r, "Cluster hours") == D("547.50")  # 730 h x $0.75
    assert item(r, "Partition hours") == D("6.57")  # 6 x 730 h x $0.0015
    assert item(r, "Data in") == D("0.07")  # 0.6799 GiB x $0.10
    # Low traffic: every record triggers its own invocation (batching window floor not reached)
    assert r.volumes["stream_invocations"] == D(730_000)
    assert item(r, "Stream processor requests") == D("0.15")  # 0.73M x $0.20/M = 0.146
    assert item(r, "Stream processor duration") == D(
        "0.39"
    )  # 730k x 40.05 ms x 1 GB x $0.0000133334
    assert item(r, "Write request units") == D(
        "14.60"
    )  # 730k x 32 KB state = 23.36M WRU x $0.625/M
    assert item(r, "Read request units") == D("0.73")  # 730k x 8 RRU = 5.84M x $0.125/M
    assert r.total_usd.quantize(D("0.01")) == D("574.49")
    assert r.by_category.get("GenAI (LLM)", D(0)) == 0


def test_llm_tokens_and_model_tiering_exact() -> None:
    base = MINIMAL.model_copy(
        update={
            "devices": 1_000_000,
            "incidents_per_1k_devices_per_day": D(1),
            "input_tokens_per_diagnosis": 1000,
            "output_tokens_per_diagnosis": 100,
        }
    )
    r = estimate(base, with_recommendations=False)
    assert r.volumes["incidents"].quantize(D("0.01")) == D("30416.67")
    assert item(r, "Input tokens") == D("76.04")  # 30.42M tokens x $2.50/M (large tier)
    assert item(r, "Output tokens") == D("30.42")  # 3.04M tokens x $10/M
    assert item(r, "Embedding tokens (RAG query)") == D("0.18")
    tiered_r = estimate(
        base.model_copy(update={"llm_large_share": D("0.2")}), with_recommendations=False
    )
    assert item(tiered_r, "Input tokens") == D("18.86")  # blended $0.62/M
    cached = estimate(
        base.model_copy(update={"llm_cache_hit_rate": D("0.5")}), with_recommendations=False
    )
    assert item(cached, "Input tokens") == D("38.02")


def test_iot_messaging_tiers() -> None:
    tiers = load_pricing()["iot_core"]["messaging_tiers"]
    assert tiered(D(500), tiers) == D("500.00")
    assert tiered(D(6000), tiers) == D("4900.00")  # 1000x1.00 + 4000x0.80 + 1000x0.70
    # payloads above 5 KB are billed in multiple units
    big = estimate(MINIMAL.model_copy(update={"payload_bytes": 6000}), with_recommendations=False)
    assert item(big, "Messaging (5 KB units, tiered)") == D("1.46")


def test_direct_kafka_path_has_no_iot_core_cost() -> None:
    r = estimate(
        MINIMAL.model_copy(update={"ingest_path": "direct_kafka"}), with_recommendations=False
    )
    assert "Ingest (IoT Core)" not in r.by_category


def test_scale_economics_and_sensitivity() -> None:
    small = estimate(FleetProfile(devices=10_000), with_recommendations=False)
    large = estimate(FleetProfile(devices=10_000_000), with_recommendations=False)
    assert large.per_device_usd < small.per_device_usd  # fixed MSK cost amortised
    assert large.volumes["msk_partitions"] > 6
    totals = [
        estimate(
            FleetProfile(devices=1_000_000, report_interval_seconds=s), with_recommendations=False
        ).total_usd
        for s in (60, 300, 900, 3600)
    ]
    assert totals == sorted(totals, reverse=True)


def test_recommendations_are_quantified_and_sorted() -> None:
    r = estimate(FleetProfile(devices=1_000_000))
    titles = [x.title for x in r.recommendations]
    assert titles[0].startswith("Batch 10 readings")
    savings = [x.monthly_savings_usd for x in r.recommendations]
    assert savings == sorted(savings, reverse=True) and all(s > 0 for s in savings)
    for rec in r.recommendations:
        assert rec.new_total_usd == r.total_usd - rec.monthly_savings_usd
    optimized = estimate(
        FleetProfile(
            devices=1_000_000,
            readings_per_message=10,
            compression_ratio=D("0.5"),
            edge_filter_ratio=D("0.3"),
        )
    )
    assert "Batch 10 readings per message at the edge" not in [
        x.title for x in optimized.recommendations
    ]


def test_profile_validation() -> None:
    with pytest.raises(ValidationError):
        FleetProfile(devices=0)
    with pytest.raises(ValidationError):
        FleetProfile(devices=10, llm_share=D("1.5"))
    with pytest.raises(ValidationError):
        FleetProfile.model_validate({"devices": 10, "unknown": 1})


def test_money_and_report_rendering() -> None:
    assert money(D("1234.565")) == "$1,234.57"
    md = render_full_report()
    assert "Scenario comparison" in md and "| **Total / month** |" in md and "Optimization" in md


def test_cli_commands(capsys: pytest.CaptureFixture[str]) -> None:
    assert cost_cli(["estimate", "--devices", "50000", "--format", "json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["profile"]["devices"] == 50000 and D(data["total_usd"]) > 0
    assert cost_cli(["estimate", "--devices", "50000", "--batch", "5"]) == 0
    assert "| **Total** |" in capsys.readouterr().out
    assert cost_cli(["compare", "--compare-devices", "1000,2000"]) == 0
    assert "2,000 devices" in capsys.readouterr().out
    assert cost_cli(["sensitivity", "--intervals", "60,120"]) == 0
    assert "| 120s |" in capsys.readouterr().out
    assert cost_cli(["report"]) == 0
    assert "generated by" in capsys.readouterr().out


def test_golden_fixture_command(capsys: pytest.CaptureFixture[str]) -> None:
    assert cost_cli(["golden"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["pricing"]["version"] == "2026-10-01"
    one_m = next(c for c in data["cases"] if c["profile"] == {"devices": 1_000_000})
    assert one_m["total_usd"] == "14789.57"  # same number as the README scenario table
