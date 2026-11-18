# syntax=docker/dockerfile:1
ARG AIRFLOW_VERSION=3.4.0
ARG PYTHON_VERSION=3.12

FROM apache/airflow:${AIRFLOW_VERSION}-python${PYTHON_VERSION} AS runtime
ARG AIRFLOW_VERSION
ENV PYTHONPATH=/opt/airflow \
    DBT_PROJECT_DIR=/opt/airflow/dbt/shop \
    DBT_PROFILES_DIR=/opt/airflow/dbt/shop \
    DBT_EXECUTABLE=/opt/dbt-venv/bin/dbt \
    DBT_SEND_ANONYMOUS_USAGE_STATS=false

# dbt in an isolated virtualenv: its pins never clash with Airflow's constraints.
USER root
RUN python -m venv /opt/dbt-venv && chown -R airflow:root /opt/dbt-venv
USER airflow
COPY requirements-dbt.txt /tmp/requirements-dbt.txt
RUN /opt/dbt-venv/bin/pip install --no-cache-dir -r /tmp/requirements-dbt.txt

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements.txt

# The dbt project is part of the image (immutable artifact); its manifest is built here,
# so Cosmos renders the task graph from a file instead of running `dbt ls` at parse time.
COPY --chown=airflow:root dbt /opt/airflow/dbt
RUN cd /opt/airflow/dbt/shop && DUCKDB_PATH=/tmp/parse.duckdb /opt/dbt-venv/bin/dbt parse --quiet
COPY --chown=airflow:root include /opt/airflow/include
COPY --chown=airflow:root dags /opt/airflow/dags

FROM runtime AS test
ARG AIRFLOW_VERSION
COPY requirements-dev.txt /tmp/requirements-dev.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements-dev.txt
COPY --chown=airflow:root pyproject.toml /opt/airflow/pyproject.toml
COPY --chown=airflow:root tests /opt/airflow/tests
WORKDIR /opt/airflow
CMD ["bash", "-c", "ruff check . && ruff format --check . && pytest"]
