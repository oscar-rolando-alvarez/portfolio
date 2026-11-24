# syntax=docker/dockerfile:1
ARG AIRFLOW_VERSION=3.4.0
FROM apache/airflow:${AIRFLOW_VERSION}-python3.12 AS runtime
# The OpenLineage and Postgres providers already ship with the official image.
COPY --chown=airflow:root dags /opt/airflow/dags

FROM runtime AS test
ARG AIRFLOW_VERSION
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" pytest==9.2.0 ruff==0.17.5
COPY --chown=airflow:root tests /opt/airflow/tests
COPY --chown=airflow:root pyproject.toml /opt/airflow/pyproject.toml
WORKDIR /opt/airflow
CMD ["bash", "-c", "ruff check dags tests && ruff format --check dags tests && pytest tests"]
