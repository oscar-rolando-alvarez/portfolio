# fleetintel (platform)

Python 3.13 package with the four Lambda handlers (stream processor, enrichment, diagnosis, API), the
detection engine, the GenAI diagnosis service, the cost estimator and the evaluation harness.

See the [project README](../README.md) for architecture, quickstart and configuration.

```bash
uv sync --locked                      # dev + local groups
uv run pytest --cov                   # unit + moto tests (Kafka test runs when KAFKA_BOOTSTRAP is set)
uv run fleetintel-cost estimate --devices 1000000
./scripts/build_lambda.sh             # dist/lambda.zip (arm64)
```
