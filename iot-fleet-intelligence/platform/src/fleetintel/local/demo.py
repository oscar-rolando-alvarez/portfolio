"""Poll the local API until the injected fault is diagnosed, then print the story.

Standard library only so it runs anywhere: ``python -m fleetintel.local.demo``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any


def get(url: str, key: str) -> Any:
    req = urllib.request.Request(url, headers={"x-api-key": key})  # noqa: S310 - local demo URL
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
        return json.loads(resp.read())


def show(bundle: dict[str, Any]) -> None:
    inc, enr, diag = bundle["incident"], bundle["enrichment"], bundle["diagnosis"]
    line = "-" * 78
    print(line)
    print(f"INCIDENT {inc['incident_id']}  [{inc['status']}]  severity={inc['severity']}")
    print(f"  suspected : {inc['suspected_fault']} on {inc['scope_type']} {inc['scope']}")
    print(f"  window    : {inc['opened_at']} -> {inc['last_seen_at']} ({inc['windows']} windows)")
    print(
        f"  impact    : {inc['affected_devices']} of {inc['total_devices']} devices; causes {inc['top_causes']}"
    )
    for s in inc["signals"]:
        if s["zscore"]:
            print(
                f"  signal    : {s['metric']} = {s['value']} (baseline {s['baseline']}, z={s['zscore']})"
            )
    if enr:
        print("ENRICHMENT")
        for item in enr["items"]:
            data = {k: v for k, v in item["data"].items() if k not in ("source",)}
            print(f"  {item['source']:<12} {item['status']:<11} {json.dumps(data)[:110]}")
    if diag:
        d = diag["diagnosis"]
        print(
            f"DIAGNOSIS  ({diag['provider']}:{diag['model']}, guardrails={diag['guardrail_status']}, "
            f"tokens={diag['input_tokens']}+{diag['output_tokens']})"
        )
        print(f"  root cause : {d['root_cause']} (confidence {d['confidence']})")
        print(f"  summary    : {d['summary']}")
        for e in d["evidence"]:
            print(f"  evidence   : {e}")
        for step in d["remediation_steps"]:
            print(f"  step {step['order']}     : [{step['owner']}] {step['action']}")
        print(f"  truck roll : {d['truck_roll_required']}")
        print(f"  customer   : {d['customer_message']}")
        print(f"  runbooks   : {', '.join(d['runbook_ids'])}")
    print(line)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--api-key", default="demo-key-acme")
    ap.add_argument("--timeout", type=int, default=240)
    args = ap.parse_args(argv)
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        try:
            items = get(f"{args.api}/v1/incidents", args.api_key)["items"]
        except (urllib.error.URLError, ConnectionError) as exc:
            print(f"waiting for API: {exc}", file=sys.stderr)
            time.sleep(3)
            continue
        done = [i for i in items if i["status"] in ("DIAGNOSED", "NEEDS_REVIEW")]
        if done:
            # let the episode settle (the stream may still be closing windows)
            time.sleep(6)
            for inc in done:
                show(get(f"{args.api}/v1/incidents/{inc['incident_id']}", args.api_key))
            return 0
        print(
            f"incidents so far: {[(i['suspected_fault'], i['status']) for i in items]}",
            file=sys.stderr,
        )
        time.sleep(3)
    print("timed out waiting for a diagnosed incident", file=sys.stderr)
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
