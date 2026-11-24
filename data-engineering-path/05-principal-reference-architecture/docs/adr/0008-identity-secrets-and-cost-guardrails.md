# ADR 0008 · No static credentials, and spend bounded by infrastructure rather than by convention

- **Status:** accepted
- **Date:** 2026-11-18

## Decision

**Identity and secrets**

- Airflow connections live in AWS Secrets Manager under `airflow/connections/*`; the MWAA role can read only that prefix.
- Snowflake service users (`LOADER_SVC`, `TRANSFORMER_SVC`) use key-pair authentication; Terraform receives only public keys.
- Snowflake reads S3 through a storage integration (IAM role with an external ID), and Databricks through a Unity Catalog storage credential. Neither uses access keys.
- CI deploys with GitHub OIDC federated into an AWS role; there are no long-lived cloud keys in CI.
- Repositories hold only `.env.example` files with placeholders (enforced in every level of this path).

**Cost guardrails**

- Snowflake: one warehouse per workload (load, transform, BI), `AUTO_SUSPEND = 60`, a monthly resource monitor per warehouse (notify at 75% and 90%, suspend at 100%, suspend immediately at 110%), statement timeouts.
- Databricks: job clusters only, a cluster policy (node allowlist, max workers, spot with on-demand driver, mandatory `cost_center` tag).
- AWS: an AWS Budget on the `cost_center` tag with forecast and actual alerts to the on-call SNS topic.
- The cost model (`cost/estimate.py`) is versioned with the infrastructure, and its assumptions are reviewed when prices or volumes change.

## Consequences

A runaway query or cluster is stopped by the platform, not discovered on the invoice. `terraform test` asserts these guardrails on every change (`terraform/modules/*/tests`).
