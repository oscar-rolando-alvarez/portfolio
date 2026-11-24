"""Astronomer Cosmos configuration for the dbt project baked into the image."""

from __future__ import annotations

import os
from pathlib import Path

from cosmos import ExecutionConfig, ProfileConfig, ProjectConfig, RenderConfig
from cosmos.constants import ExecutionMode, LoadMode, TestBehavior

DBT_PROJECT_DIR = Path(os.getenv("DBT_PROJECT_DIR", "/opt/airflow/dbt/shop"))
DBT_EXECUTABLE = os.getenv("DBT_EXECUTABLE", "/opt/dbt-venv/bin/dbt")

project_config = ProjectConfig(
    dbt_project_path=DBT_PROJECT_DIR,
    # Parsed at image build time: the DAG processor reads a JSON file instead of
    # shelling out to `dbt ls` on every parse loop.
    manifest_path=DBT_PROJECT_DIR / "target" / "manifest.json",
)

profile_config = ProfileConfig(
    profile_name="shop",
    target_name=os.getenv("DBT_TARGET", "local"),
    profiles_yml_filepath=DBT_PROJECT_DIR / "profiles.yml",
)

# dbt lives in its own virtualenv so its dependencies never fight Airflow's.
execution_config = ExecutionConfig(execution_mode=ExecutionMode.LOCAL, dbt_executable_path=DBT_EXECUTABLE)

render_config = RenderConfig(
    load_method=LoadMode.DBT_MANIFEST,
    # One task per model running `dbt build` (model + its tests): a failing test stops
    # downstream models from building on bad data, and retries are per model.
    test_behavior=TestBehavior.BUILD,
)
