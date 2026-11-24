"""Contract tests for the local Jobs API 2.2 emulator, using the operator's request shapes."""

import time

import pytest
from fastapi.testclient import TestClient

from databricks_local import app as api

AUTH = {"Authorization": f"Bearer {api.TOKEN}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "WORKSPACE", tmp_path)
    monkeypatch.setattr(api, "LOG_DIR", tmp_path / "logs")
    (tmp_path / "ok.py").write_text("import sys; print('args', sys.argv[1:])\n")
    (tmp_path / "boom.py").write_text("raise ValueError('bad batch')\n")
    return TestClient(api.app)


def submit(client, python_file, token=None, params=("--batch-date", "2026-11-17")):
    body = {
        "run_name": "t",
        "tasks": [
            {"task_key": "t", "spark_python_task": {"python_file": python_file, "parameters": list(params)}}
        ],
    }
    if token:
        body["idempotency_token"] = token
    response = client.post("/api/2.2/jobs/runs/submit", json=body, headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()["run_id"]


def wait(client, run_id):
    for _ in range(200):
        run = client.get("/api/2.2/jobs/runs/get", params={"run_id": run_id}, headers=AUTH).json()
        if run["state"]["life_cycle_state"] in ("TERMINATED", "INTERNAL_ERROR"):
            return run
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def test_requires_bearer_token(client):
    assert client.get("/api/2.2/jobs/runs/get", params={"run_id": 1}).status_code == 401


def test_successful_run(client):
    run = wait(client, submit(client, "ok.py"))
    assert run["state"]["result_state"] == "SUCCESS"
    assert "args ['--batch-date', '2026-11-17']" in client.get(f"/runs/{run['run_id']}").text


def test_failed_run_reports_the_error(client):
    run = wait(client, submit(client, "boom.py"))
    assert run["state"]["result_state"] == "FAILED"
    output = client.get(
        "/api/2.2/jobs/runs/get-output", params={"run_id": run["run_id"]}, headers=AUTH
    ).json()
    assert "ValueError: bad batch" in output["error"]


def test_idempotency_token_reattaches(client):
    first = submit(client, "ok.py", token="dag-task-run-1")
    assert submit(client, "ok.py", token="dag-task-run-1") == first
    assert submit(client, "ok.py", token="dag-task-run-2") != first


def test_run_id_in_json_body_like_the_async_hook(client):
    run_id = submit(client, "ok.py")
    wait(client, run_id)
    response = client.request("GET", "/api/2.2/jobs/runs/get", json={"run_id": run_id}, headers=AUTH)
    assert response.status_code == 200 and response.json()["run_id"] == run_id


def test_missing_file_and_path_escape(client):
    assert wait(client, submit(client, "missing.py"))["state"]["life_cycle_state"] == "INTERNAL_ERROR"
    body = {"tasks": [{"task_key": "x", "spark_python_task": {"python_file": "../../etc/passwd"}}]}
    assert client.post("/api/2.2/jobs/runs/submit", json=body, headers=AUTH).status_code == 400
