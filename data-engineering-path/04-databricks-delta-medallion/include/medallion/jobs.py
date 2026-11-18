"""Build Databricks Jobs API `runs/submit` payloads for each medallion layer.

Two targets, chosen by MEDALLION_TARGET:

* ``local``: the databricks-local container (Spark + Delta). Files resolve inside its
  /workspace; tables are path-based under LAKE_ROOT.
* ``databricks``: a real workspace. Code comes from Git (`git_source`) at a pinned
  ref, runs on a job cluster created for the run, and writes Unity Catalog tables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

LAYERS = {
    "bronze": "jobs/bronze_ingest.py",
    "silver": "jobs/silver_events.py",
    "gold": "jobs/gold_daily_metrics.py",
}
REPO_SUBDIR = "data-engineering-path/04-databricks-delta-medallion"


@dataclass(frozen=True)
class Target:
    kind: str
    lake_root: str = "/lake"
    catalog: str = "main"
    schema: str = "clickstream"
    git_url: str = ""
    git_branch: str = "master"
    spark_version: str = "17.3.x-scala2.13"
    node_type_id: str = "m7gd.xlarge"
    max_workers: int = 4
    cluster_policy_id: str = ""

    @classmethod
    def from_env(cls) -> Target:
        kind = os.getenv("MEDALLION_TARGET", "local")
        if kind not in {"local", "databricks"}:
            raise ValueError(f"MEDALLION_TARGET must be 'local' or 'databricks', got {kind!r}")
        return cls(
            kind=kind,
            lake_root=os.getenv("LAKE_ROOT", "/lake"),
            catalog=os.getenv("DATABRICKS_CATALOG", "main"),
            schema=os.getenv("DATABRICKS_SCHEMA", "clickstream"),
            git_url=os.getenv("DATABRICKS_GIT_URL", ""),
            git_branch=os.getenv("DATABRICKS_GIT_BRANCH", "master"),
            spark_version=os.getenv("DATABRICKS_SPARK_VERSION", "17.3.x-scala2.13"),
            node_type_id=os.getenv("DATABRICKS_NODE_TYPE", "m7gd.xlarge"),
            max_workers=int(os.getenv("DATABRICKS_MAX_WORKERS", "4")),
            cluster_policy_id=os.getenv("DATABRICKS_CLUSTER_POLICY_ID", ""),
        )


def parameters(target: Target, batch_date: str, layer: str) -> list[str]:
    params = ["--batch-date", batch_date]
    if target.kind == "local":
        params += ["--lake-root", target.lake_root]
    else:
        params += ["--catalog", target.catalog, "--schema", target.schema]
    if layer == "silver":
        params += ["--max-invalid-ratio", "0.05"]
    return params


def submit_payload(target: Target, layer: str, batch_date: str) -> dict:
    task: dict = {
        "task_key": layer,
        "spark_python_task": {
            "python_file": LAYERS[layer],
            "parameters": parameters(target, batch_date, layer),
        },
    }
    payload: dict = {
        "run_name": f"clickstream-{layer}-{batch_date}",
        "timeout_seconds": 3600,
        "tasks": [task],
    }
    if target.kind == "databricks":
        task["spark_python_task"]["python_file"] = f"{REPO_SUBDIR}/{LAYERS[layer]}"
        task["spark_python_task"]["source"] = "GIT"
        cluster = {
            "spark_version": target.spark_version,
            "node_type_id": target.node_type_id,
            "autoscale": {"min_workers": 1, "max_workers": target.max_workers},
            "data_security_mode": "SINGLE_USER",  # Unity Catalog access mode for jobs
            "custom_tags": {
                "cost_center": "data-platform",
                "pipeline": "clickstream_medallion",
                "layer": layer,
            },
            "aws_attributes": {"availability": "SPOT_WITH_FALLBACK", "first_on_demand": 1},
        }
        if target.cluster_policy_id:
            cluster["policy_id"] = target.cluster_policy_id
        task["new_cluster"] = cluster
        payload["git_source"] = {
            "git_url": target.git_url,
            "git_provider": "gitHub",
            "git_branch": target.git_branch,
        }
    return payload
