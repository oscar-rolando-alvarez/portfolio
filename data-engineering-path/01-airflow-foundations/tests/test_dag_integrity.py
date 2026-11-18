"""DAG integrity checks: the first CI gate. No broken or non-compliant DAG reaches production."""

import pytest
from airflow.models import DagBag

from tests.conftest import DAGS_FOLDER


@pytest.fixture(scope="module")
def dagbag(airflow_db):
    return DagBag(dag_folder=str(DAGS_FOLDER))


def test_no_import_errors(dagbag):
    assert dagbag.import_errors == {}
    assert dagbag.dags, "no DAGs found"


def test_every_dag_follows_platform_rules(dagbag):
    for dag_id, dag in dagbag.dags.items():
        assert dag.default_args.get("owner"), f"{dag_id}: owner missing"
        assert dag.default_args.get("retries", 0) >= 1, f"{dag_id}: retries missing"
        assert dag.catchup is False, f"{dag_id}: catchup must be explicit and off"
        assert dag.tags, f"{dag_id}: tags missing"
        assert dag.doc_md, f"{dag_id}: documentation missing"


def test_weather_dag_shape(dagbag):
    dag = dagbag.dags["weather_daily_ingest"]
    assert dag.task_dict["extract"].downstream_task_ids == {"validate", "publish"}
    assert dag.task_dict["validate"].downstream_task_ids == {"publish"}
