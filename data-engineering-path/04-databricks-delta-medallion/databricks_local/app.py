"""A small local stand-in for the Databricks Jobs API 2.2 (one-time runs only).

It implements just what Airflow's DatabricksSubmitRunOperator uses (runs/submit,
runs/get, runs/get-output, runs/cancel), and runs each `spark_python_task` as a
local PySpark + Delta Lake process. The Airflow DAG is byte-for-byte the same one
that targets a real workspace; only the `databricks_default` connection changes.

Not a Databricks product, not affiliated with Databricks; for local development and CI.
"""

from __future__ import annotations

import itertools
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse

WORKSPACE = Path(os.getenv("WORKSPACE_ROOT", "/workspace"))
LOG_DIR = Path(os.getenv("RUN_LOG_DIR", "/tmp/databricks-local-runs"))
TOKEN = os.getenv("LOCAL_DATABRICKS_TOKEN", "local-dev-token")
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8090")


@dataclass
class Run:
    run_id: int
    run_name: str
    task_key: str
    python_file: str
    parameters: list[str]
    life_cycle_state: str = "PENDING"
    result_state: str | None = None
    state_message: str = ""
    start_time: int = field(default_factory=lambda: int(time.time() * 1000))
    end_time: int = 0
    process: subprocess.Popen | None = None

    @property
    def log_path(self) -> Path:
        return LOG_DIR / f"{self.run_id}.log"

    def state(self) -> dict:
        state = {"life_cycle_state": self.life_cycle_state, "state_message": self.state_message}
        if self.result_state:
            state["result_state"] = self.result_state
        return state

    def to_api(self) -> dict:
        return {
            "run_id": self.run_id,
            "job_id": 0,
            "run_name": self.run_name,
            "run_type": "SUBMIT_RUN",
            "state": self.state(),
            "start_time": self.start_time,
            "end_time": self.end_time,
            "run_page_url": f"{PUBLIC_URL}/runs/{self.run_id}",
            "tasks": [
                {
                    "run_id": self.run_id,
                    "task_key": self.task_key,
                    "state": self.state(),
                    "spark_python_task": {"python_file": self.python_file, "parameters": self.parameters},
                }
            ],
        }


app = FastAPI(title="databricks-local", version="1.0")
_runs: dict[int, Run] = {}
_tokens: dict[str, int] = {}
_ids = itertools.count(1001)
_lock = threading.Lock()
# One job at a time, like a single small cluster; also keeps laptop memory in check.
_pool = ThreadPoolExecutor(max_workers=int(os.getenv("MAX_CONCURRENT_RUNS", "1")))


def require_token(authorization: str = Header(default="")) -> None:
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


def _resolve(python_file: str) -> Path:
    path = (WORKSPACE / python_file.lstrip("/")).resolve()
    if WORKSPACE.resolve() not in path.parents:
        raise HTTPException(status_code=400, detail=f"python_file escapes the workspace: {python_file}")
    return path


def _execute(run: Run) -> None:
    script = _resolve(run.python_file)
    if run.life_cycle_state == "TERMINATED":  # cancelled while pending
        return
    if not script.exists():
        run.life_cycle_state, run.result_state = "INTERNAL_ERROR", "FAILED"
        run.state_message = f"python_file not found: {run.python_file}"
        run.end_time = int(time.time() * 1000)
        return
    run.life_cycle_state = "RUNNING"
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "LOCAL_DELTA": "1", "PYTHONUNBUFFERED": "1"}
    with run.log_path.open("w") as log:
        run.process = subprocess.Popen(
            [sys.executable, str(script), *run.parameters],
            stdout=log,
            stderr=subprocess.STDOUT,
            cwd=script.parent,
            env=env,
        )
        code = run.process.wait()
    run.end_time = int(time.time() * 1000)
    if run.result_state == "CANCELED":
        run.life_cycle_state = "TERMINATED"
        return
    run.life_cycle_state = "TERMINATED"
    run.result_state = "SUCCESS" if code == 0 else "FAILED"
    run.state_message = "" if code == 0 else _last_error(run.log_path)


def _last_error(log_path: Path) -> str:
    lines = [line for line in log_path.read_text(errors="replace").splitlines() if line.strip()]
    errors = [line for line in lines if "Error" in line or "Exception" in line]
    return (errors or lines or ["process failed"])[-1][:500]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "runs": len(_runs)}


@app.post("/api/2.2/jobs/runs/submit", dependencies=[Depends(require_token)])
def submit(body: dict) -> dict:
    token = body.get("idempotency_token")
    with _lock:
        # Same token -> same run: a retried Airflow task re-attaches instead of launching twice.
        if token and token in _tokens:
            return {"run_id": _tokens[token]}
        tasks = body.get("tasks") or [{"task_key": "main", **body}]
        if len(tasks) != 1 or "spark_python_task" not in tasks[0]:
            raise HTTPException(
                status_code=400, detail="databricks-local supports exactly one spark_python_task"
            )
        task = tasks[0]
        python_task = task["spark_python_task"]
        _resolve(python_task["python_file"])
        run = Run(
            run_id=next(_ids),
            run_name=body.get("run_name", "submit-run"),
            task_key=task.get("task_key", "main"),
            python_file=python_task["python_file"],
            parameters=[str(p) for p in python_task.get("parameters", [])],
        )
        _runs[run.run_id] = run
        if token:
            _tokens[token] = run.run_id
    _pool.submit(_execute, run)
    return {"run_id": run.run_id}


def _get(run_id: int) -> Run:
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"run {run_id} does not exist")
    return _runs[run_id]


async def _run_id(request: Request) -> int:
    """Databricks accepts GET parameters in the query string or a JSON body; the provider's
    sync hook uses the former and its async (deferrable) hook the latter."""
    value = request.query_params.get("run_id")
    if value is None and await request.body():
        value = (await request.json()).get("run_id")
    if value is None:
        raise HTTPException(status_code=400, detail="run_id is required")
    return int(value)


@app.get("/api/2.2/jobs/runs/get", dependencies=[Depends(require_token)])
async def get_run(request: Request) -> dict:
    return _get(await _run_id(request)).to_api()


@app.get("/api/2.2/jobs/runs/get-output", dependencies=[Depends(require_token)])
async def get_output(request: Request) -> dict:
    run = _get(await _run_id(request))
    log = run.log_path.read_text(errors="replace") if run.log_path.exists() else ""
    output = {"metadata": run.to_api(), "logs": log[-5000:], "logs_truncated": len(log) > 5000}
    if run.result_state == "FAILED":
        output["error"] = run.state_message
        output["error_trace"] = log[-5000:]
    return output


@app.post("/api/2.2/jobs/runs/cancel", dependencies=[Depends(require_token)])
def cancel(body: dict) -> dict:
    run = _get(int(body["run_id"]))
    if run.life_cycle_state in ("PENDING", "RUNNING"):
        run.result_state, run.state_message = "CANCELED", "cancelled by user"
        if run.process and run.process.poll() is None:
            run.process.terminate()
        else:
            run.life_cycle_state = "TERMINATED"
    return {}


@app.get("/runs/{run_id}", response_class=PlainTextResponse)
def run_page(run_id: int) -> str:
    """What `run_page_url` points to: the run's driver log."""
    run = _get(run_id)
    log = run.log_path.read_text(errors="replace") if run.log_path.exists() else "(no output yet)"
    return f"run {run_id} {run.run_name}: {run.state()}\n\n{log}"
