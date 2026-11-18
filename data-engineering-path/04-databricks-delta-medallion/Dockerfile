# syntax=docker/dockerfile:1
ARG AIRFLOW_VERSION=3.4.0
ARG PYTHON_VERSION=3.12

FROM apache/airflow:${AIRFLOW_VERSION}-python${PYTHON_VERSION} AS runtime
ARG AIRFLOW_VERSION
ENV PYTHONPATH=/opt/airflow
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /tmp/requirements.txt
COPY --chown=airflow:root include /opt/airflow/include
COPY --chown=airflow:root jobs /opt/airflow/jobs
COPY --chown=airflow:root dags /opt/airflow/dags

FROM runtime AS test
ARG AIRFLOW_VERSION
COPY requirements-dev.txt /tmp/requirements-dev.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" pytest==9.2.0 ruff==0.17.5
COPY --chown=airflow:root pyproject.toml /opt/airflow/pyproject.toml
COPY --chown=airflow:root tests_airflow /opt/airflow/tests_airflow
WORKDIR /opt/airflow
CMD ["bash", "-c", "ruff check dags include tests_airflow && ruff format --check dags include tests_airflow && pytest tests_airflow"]
