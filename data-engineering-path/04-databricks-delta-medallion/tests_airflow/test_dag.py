import pendulum
import pytest
from airflow.models import DagBag

from include.medallion.jobs import Target, submit_payload
from tests_airflow.conftest import DAGS_FOLDER


@pytest.fixture(scope="module")
def dag(airflow_db):
    bag = DagBag(dag_folder=str(DAGS_FOLDER))
    assert bag.import_errors == {}
    return bag.dags["clickstream_medallion"]


def render(dag, task_id, run_id="scheduled__2026-11-18T02:30:00+00:00", field="json"):
    op = dag.task_dict[task_id]
    context = {
        "dag": dag,
        "task": op,
        "run_id": run_id,
        "data_interval_start": pendulum.datetime(2026, 11, 17, 2, 30, tz="UTC"),
        **dag.user_defined_macros,
    }
    return op.render_template(getattr(op, field), context, jinja_env=dag.get_template_env())


def token(dag, task_id, run_id="scheduled__2026-11-18T02:30:00+00:00"):
    return render(dag, task_id, run_id, field="idempotency_token")


def test_platform_rules(dag):
    assert dag.default_args["owner"] and dag.default_args["retries"] >= 1
    assert dag.catchup is False and dag.tags and dag.doc_md
    assert [t.task_id for t in dag.topological_sort()] == ["land_events", "bronze", "silver", "gold"]


def test_operators_are_deferrable_and_gold_publishes_an_asset(dag):
    for layer in ("bronze", "silver", "gold"):
        assert dag.task_dict[layer].deferrable is True
    assert [a.name for a in dag.task_dict["gold"].outlets] == ["gold.daily_metrics"]


def test_rendered_payload_uses_the_data_interval(dag):
    payload = render(dag, "silver")
    params = payload["tasks"][0]["spark_python_task"]["parameters"]
    assert params[:2] == ["--batch-date", "2026-11-17"]
    assert "--max-invalid-ratio" in params


def test_idempotency_token_is_short_stable_and_unique_per_run(dag):
    a = token(dag, "bronze")
    assert 0 < len(a) <= 64
    assert token(dag, "bronze") == a  # a retry re-attaches to the same Databricks run
    assert token(dag, "silver") != a
    assert token(dag, "bronze", run_id="manual__other") != a


def test_databricks_target_payload():
    target = Target(kind="databricks", git_url="https://github.com/example/repo", cluster_policy_id="P1")
    payload = submit_payload(target, "gold", "2026-11-17")
    task = payload["tasks"][0]
    assert task["spark_python_task"]["source"] == "GIT"
    assert task["spark_python_task"]["python_file"].endswith("jobs/gold_daily_metrics.py")
    assert task["spark_python_task"]["parameters"] == [
        "--batch-date",
        "2026-11-17",
        "--catalog",
        "main",
        "--schema",
        "clickstream",
    ]
    cluster = task["new_cluster"]
    assert cluster["policy_id"] == "P1" and cluster["data_security_mode"] == "SINGLE_USER"
    assert cluster["custom_tags"]["layer"] == "gold"
    assert payload["git_source"]["git_url"] == "https://github.com/example/repo"


def test_local_target_payload_has_no_cluster():
    payload = submit_payload(Target(kind="local"), "bronze", "2026-11-17")
    assert "new_cluster" not in payload["tasks"][0] and "git_source" not in payload
    assert payload["tasks"][0]["spark_python_task"]["parameters"][-2:] == ["--lake-root", "/lake"]
