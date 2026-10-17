"""``fleetintel-cost``: estimate the monthly cost of running the platform at a given scale."""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal

from fleetintel.cost.model import CENT, FleetProfile, estimate, load_pricing
from fleetintel.cost.report import (
    render_comparison,
    render_estimate,
    render_full_report,
    render_sensitivity,
)


def _profile(args: argparse.Namespace, devices: int | None = None) -> FleetProfile:
    return FleetProfile(
        devices=devices or args.devices,
        report_interval_seconds=args.interval,
        payload_bytes=args.payload_bytes,
        ingest_path=args.ingest,
        readings_per_message=args.batch,
        compression_ratio=Decimal(str(args.compression)),
        edge_filter_ratio=Decimal(str(args.edge_filter)),
        incidents_per_1k_devices_per_day=Decimal(str(args.incident_rate)),
        llm_share=Decimal(str(args.llm_share)),
        llm_cache_hit_rate=Decimal(str(args.llm_cache)),
        llm_large_share=Decimal(str(args.llm_large_share)),
        input_tokens_per_diagnosis=args.input_tokens,
        output_tokens_per_diagnosis=args.output_tokens,
        kafka_retention_hours=args.retention_hours,
        api_requests_per_month=args.api_requests,
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="fleetintel-cost", description=__doc__)
    ap.add_argument("command", choices=["estimate", "compare", "sensitivity", "report", "golden"])
    ap.add_argument("--devices", type=int, default=1_000_000)
    ap.add_argument("--compare-devices", default="10000,1000000,10000000")
    ap.add_argument("--intervals", default="60,300,900,3600")
    ap.add_argument("--interval", type=int, default=300, help="seconds between readings per device")
    ap.add_argument("--payload-bytes", type=int, default=512)
    ap.add_argument("--ingest", choices=["iot_core", "direct_kafka"], default="iot_core")
    ap.add_argument("--batch", type=int, default=1, help="readings per message (edge batching)")
    ap.add_argument("--compression", type=float, default=1.0)
    ap.add_argument("--edge-filter", type=float, default=0.0)
    ap.add_argument(
        "--incident-rate", type=float, default=0.5, help="incidents per 1k devices per day"
    )
    ap.add_argument("--llm-share", type=float, default=1.0)
    ap.add_argument("--llm-cache", type=float, default=0.0)
    ap.add_argument("--llm-large-share", type=float, default=1.0)
    ap.add_argument("--input-tokens", type=int, default=3500)
    ap.add_argument("--output-tokens", type=int, default=600)
    ap.add_argument("--retention-hours", type=int, default=24)
    ap.add_argument("--api-requests", type=int, default=100_000)
    ap.add_argument("--format", choices=["md", "json"], default="md")
    args = ap.parse_args(argv)

    if args.command == "golden":
        print(json.dumps(golden(), indent=1, sort_keys=True))
        return 0
    if args.command == "report":
        sys.stdout.write(render_full_report())
        return 0
    if args.command == "compare":
        devices = tuple(int(x) for x in args.compare_devices.split(","))
        print(render_comparison(_profile(args), devices))
        return 0
    if args.command == "sensitivity":
        intervals = tuple(int(x) for x in args.intervals.split(","))
        print(render_sensitivity(_profile(args), intervals))
        return 0
    report = estimate(_profile(args))
    if args.format == "json":
        print(json.dumps(report.model_dump(mode="json"), indent=2))
    else:
        print(render_estimate(report))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


# Profiles whose results are frozen into dashboard/src/lib/cost/golden.json. The
# dashboard's TypeScript port of the estimator must reproduce them to the cent
# (vitest), and CI fails if this output and the committed file drift apart.
GOLDEN_CASES: list[dict[str, object]] = [
    {"devices": 10_000},
    {"devices": 1_000_000},
    {"devices": 10_000_000},
    {"devices": 1_000_000, "report_interval_seconds": 60},
    {"devices": 1_000_000, "report_interval_seconds": 900},
    {"devices": 1_000_000, "report_interval_seconds": 3600},
    {"devices": 1_000_000, "readings_per_message": 10},
    {"devices": 1_000_000, "compression_ratio": "0.5", "edge_filter_ratio": "0.3"},
    {"devices": 250_000, "ingest_path": "direct_kafka"},
    {"devices": 2_500_000, "payload_bytes": 6000, "report_interval_seconds": 600},
    {"devices": 1_000_000, "llm_share": "0.2", "llm_large_share": "0.2"},
    {"devices": 5_000_000, "llm_cache_hit_rate": "0.3", "incidents_per_1k_devices_per_day": "2"},
    {"devices": 50_000, "report_interval_seconds": 30, "payload_bytes": 2048},
    {
        "devices": 1000,
        "report_interval_seconds": 3600,
        "payload_bytes": 1000,
        "incidents_per_1k_devices_per_day": "0",
        "api_requests_per_month": 0,
        "kms_keys": 0,
        "sqs_pollers_per_queue": 0,
        "log_bytes_per_stream_invocation": 0,
        "xray_sampling": "0",
    },
]


def golden() -> dict[str, object]:
    def c(x: Decimal) -> str:
        return str(x.quantize(CENT))

    cases = []
    for raw in GOLDEN_CASES:
        r = estimate(FleetProfile.model_validate(raw))
        cases.append(
            {
                "profile": raw,
                "total_usd": c(r.total_usd),
                "per_device_usd": str(r.per_device_usd.quantize(Decimal("0.000001"))),
                "by_category": {k: c(v) for k, v in r.by_category.items()},
                "volumes": {k: str(v.quantize(Decimal("0.01"))) for k, v in r.volumes.items()},
                "recommendations": [
                    {"title": x.title, "monthly_savings_usd": c(x.monthly_savings_usd)}
                    for x in r.recommendations
                ],
            }
        )
    return {"generated_by": "fleetintel-cost golden", "pricing": load_pricing(), "cases": cases}
