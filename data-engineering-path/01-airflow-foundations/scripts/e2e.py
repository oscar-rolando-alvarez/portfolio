#!/usr/bin/env python3
"""End-to-end smoke test against the running docker compose stack (stdlib only).

Talks to the Airflow 3 REST API (/api/v2): unpauses a DAG, triggers (or attaches to,
or clears and reruns) the run for a logical date, waits, and exits non-zero unless
the run succeeded.

    python3 scripts/e2e.py DAG_ID --logical-date 2026-11-18T02:00:00Z [--conf '{}']
        [--until-deferred TASK_ID]   # return as soon as TASK_ID is deferred (sensor demo)
        [--rerun]                    # clear an existing run and run it again (idempotency demo)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.getenv("AIRFLOW_URL", f"http://localhost:{os.getenv('AIRFLOW_PORT', '8081')}")


class ApiError(RuntimeError):
    pass


def call(method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as err:
        raise ApiError(f"{method} {path} -> {err.code}: {err.read().decode()[:500]}") from err


def login() -> str:
    body = {
        "username": os.getenv("AIRFLOW_ADMIN_USER", "airflow"),
        "password": os.getenv("AIRFLOW_ADMIN_PASSWORD", "airflow"),
    }
    return call("POST", "/auth/token", body=body)["access_token"]


def wait_for_dag(dag_id: str, token: str, timeout: int = 180) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            call("GET", f"/api/v2/dags/{dag_id}", token)
            return
        except ApiError:
            time.sleep(5)
    sys.exit(f"DAG {dag_id} was not parsed within {timeout}s")


def find_run(dag_id: str, logical_date: str, token: str) -> str | None:
    query = urllib.parse.urlencode({"logical_date_gte": logical_date, "logical_date_lte": logical_date})
    runs = call("GET", f"/api/v2/dags/{dag_id}/dagRuns?{query}", token)["dag_runs"]
    return runs[0]["dag_run_id"] if runs else None


def task_states(dag_id: str, run_id: str, token: str) -> list[dict]:
    path = f"/api/v2/dags/{dag_id}/dagRuns/{urllib.parse.quote(run_id)}/taskInstances"
    return call("GET", path, token)["task_instances"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dag_id")
    parser.add_argument("--logical-date", required=True)
    parser.add_argument("--conf", default="{}")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--until-deferred", metavar="TASK_ID")
    parser.add_argument("--rerun", action="store_true")
    args = parser.parse_args()

    token = login()
    wait_for_dag(args.dag_id, token)
    call("PATCH", f"/api/v2/dags/{args.dag_id}", token, {"is_paused": False})

    run_id = find_run(args.dag_id, args.logical_date, token)
    if run_id and args.rerun:
        call(
            "POST",
            f"/api/v2/dags/{args.dag_id}/clearTaskInstances",
            token,
            {"dag_run_id": run_id, "dry_run": False, "only_failed": False, "reset_dag_runs": True},
        )
        print(f"cleared {args.dag_id} {run_id}: running it again")
        time.sleep(3)
    elif run_id:
        print(f"attached to existing {args.dag_id} {run_id}")
    else:
        body = {"logical_date": args.logical_date, "conf": json.loads(args.conf)}
        run_id = call("POST", f"/api/v2/dags/{args.dag_id}/dagRuns", token, body)["dag_run_id"]
        print(f"triggered {args.dag_id} {run_id}")

    run_path = f"/api/v2/dags/{args.dag_id}/dagRuns/{urllib.parse.quote(run_id)}"
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        if args.until_deferred:
            states = {t["task_id"]: t["state"] for t in task_states(args.dag_id, run_id, token)}
            if states.get(args.until_deferred) == "deferred":
                print(f"  {args.until_deferred}: deferred (waiting in the triggerer, no worker slot held)")
                return
        state = call("GET", run_path, token)["state"]
        if state in {"success", "failed"}:
            for ti in sorted(task_states(args.dag_id, run_id, token), key=lambda t: t["task_id"]):
                index = "" if ti.get("map_index", -1) == -1 else f"[{ti['map_index']}]"
                print(f"  {ti['task_id']}{index}: {ti['state']}")
            print(f"{args.dag_id} {run_id}: {state}")
            sys.exit(0 if state == "success" else 1)
        time.sleep(3)
    sys.exit(f"timed out waiting for {run_id}")


if __name__ == "__main__":
    try:
        main()
    except ApiError as err:
        sys.exit(str(err))
