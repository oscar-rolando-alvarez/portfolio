"""Shared fixtures: an isolated Airflow home with a throw-away SQLite metadata DB."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Must be set before Airflow is imported anywhere in the test session.
_AIRFLOW_HOME = Path(tempfile.mkdtemp(prefix="airflow-test-"))
os.environ["AIRFLOW_HOME"] = str(_AIRFLOW_HOME)
os.environ["AIRFLOW__DATABASE__SQL_ALCHEMY_CONN"] = f"sqlite:///{_AIRFLOW_HOME / 'airflow.db'}"
os.environ["AIRFLOW__CORE__LOAD_EXAMPLES"] = "false"
os.environ["AIRFLOW__CORE__UNIT_TEST_MODE"] = "true"
os.environ.setdefault("WAREHOUSE_BACKEND", "duckdb")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DAGS_FOLDER = PROJECT_ROOT / "dags"
os.environ["AIRFLOW__CORE__DAGS_FOLDER"] = str(DAGS_FOLDER)
sys.path.insert(0, str(PROJECT_ROOT))

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def airflow_db():
    """Create the metadata schema once per session (needed by dag.test())."""
    subprocess.run(["airflow", "db", "migrate"], check=True, capture_output=True)
    return _AIRFLOW_HOME


@pytest.fixture
def local_env(tmp_path, monkeypatch):
    """Point the pipeline at a temp data root and DuckDB file, as compose does."""
    monkeypatch.setenv("DATA_ROOT", str(tmp_path))
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "warehouse.duckdb"))
    monkeypatch.setenv("WAREHOUSE_BACKEND", "duckdb")
    monkeypatch.setenv("AIRFLOW_CONN_FS_DEFAULT", f'{{"conn_type": "fs", "extra": {{"path": "{tmp_path}"}}}}')
    return tmp_path
