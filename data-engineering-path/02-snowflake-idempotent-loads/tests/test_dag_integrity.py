import pytest
from airflow.models import DagBag

from tests.conftest import DAGS_FOLDER


@pytest.fixture(scope="module")
def dagbag(airflow_db):
    return DagBag(dag_folder=str(DAGS_FOLDER))


def test_no_import_errors(dagbag):
    assert dagbag.import_errors == {}
    assert set(dagbag.dags) == {"ecommerce_source_simulator", "ecommerce_daily_load"}


def test_every_dag_follows_platform_rules(dagbag):
    for dag_id, dag in dagbag.dags.items():
        assert dag.default_args.get("owner"), dag_id
        assert dag.default_args.get("retries", 0) >= 1, dag_id
        assert dag.catchup is False, dag_id
        assert dag.tags and dag.doc_md, dag_id


def test_loader_uses_pool_and_deferrable_sensor(dagbag):
    dag = dagbag.dags["ecommerce_daily_load"]
    assert dag.task_dict["load_table"].pool == "warehouse"
    assert dag.task_dict["wait_for_extract"].deferrable is True
