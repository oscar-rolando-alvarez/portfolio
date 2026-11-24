# syntax=docker/dockerfile:1
ARG AIRFLOW_VERSION=3.4.0
ARG PYTHON_VERSION=3.12

FROM apache/airflow:${AIRFLOW_VERSION}-python${PYTHON_VERSION} AS runtime
ENV PYTHONPATH=/opt/airflow
COPY --chown=airflow:root include /opt/airflow/include
COPY --chown=airflow:root dags /opt/airflow/dags

# Test image: same runtime plus test tooling, never shipped.
FROM runtime AS test
ARG AIRFLOW_VERSION
COPY requirements-dev.txt /tmp/requirements-dev.txt
# Pin apache-airflow so pip can never up/downgrade the core while resolving dev tools.
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements-dev.txt
COPY --chown=airflow:root pyproject.toml /opt/airflow/pyproject.toml
COPY --chown=airflow:root tests /opt/airflow/tests
WORKDIR /opt/airflow
CMD ["bash", "-c", "ruff check . && ruff format --check . && pytest"]
