# ADR 0001 · Run Airflow on Amazon MWAA; keep the EKS + Helm option documented

- **Status:** accepted
- **Date:** 2026-11-18

## Context

The platform needs Airflow 3 for a few hundred DAGs owned by three to five teams. The data team is small, has no dedicated Kubernetes operators, and the company is all-in on AWS. Workloads are mostly I/O-bound orchestration: the heavy compute runs in Snowflake and Databricks, not in Airflow workers.

## Options

| Option | For | Against |
|---|---|---|
| **MWAA** | No control plane to run; IAM, VPC, CloudWatch and Secrets Manager integration; upgrades are a version bump; HA schedulers | Trails upstream Airflow by months; limited control over the executor, worker image and plugins; per-environment fixed cost; slow environment updates (20-40 min) |
| **Self-managed on EKS (official Helm chart)** | Latest Airflow; KubernetesExecutor / per-task images; fine-grained autoscaling (KEDA); one cluster can host several environments | We own upgrades, the metadata database, security patching and on-call for the control plane |
| **Astronomer (Astro)** | Best developer experience, fast upgrades, deployment rollbacks | Another vendor and contract; data-plane networking to review |

## Decision

MWAA for production, two environments (`staging`, `prod`), private web server, two schedulers, Secrets Manager backend, OpenLineage to the lineage service. Locally, every engineer runs the same Airflow major version with Docker Compose (Levels 1-4).

## Consequences

- Task code must be **runtime-agnostic**: no reliance on local disk between tasks, all I/O through S3 or the warehouse, dependencies pinned with the Airflow constraints file.
- Heavy or exotic dependencies (dbt, Spark) never install into the Airflow environment. dbt runs in its own venv (Cosmos), Spark runs on Databricks.
- **Revisit** when any of these hold: more than about 1,000 DAGs or several isolated tenants; a need for per-task container images; MWAA's version lag blocks a needed feature. The migration path to EKS is the official Helm chart, with the same DAG repository and the same Terraform outputs (buckets, roles, secrets).
