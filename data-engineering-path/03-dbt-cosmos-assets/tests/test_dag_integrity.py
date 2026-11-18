import json

import pytest
from airflow.models import DagBag

from include.ecommerce import assets
from include.ecommerce.dbt_config import DBT_PROJECT_DIR
from tests.conftest import DAGS_FOLDER


@pytest.fixture(scope="module")
def dagbag(airflow_db):
    return DagBag(dag_folder=str(DAGS_FOLDER))


def test_no_import_errors(dagbag):
    assert dagbag.import_errors == {}
    assert set(dagbag.dags) == {"shop_raw_ingest", "shop_dbt_transform", "revenue_report"}


def test_every_dag_follows_platform_rules(dagbag):
    for dag_id, dag in dagbag.dags.items():
        assert dag.default_args.get("owner"), dag_id
        assert dag.default_args.get("retries", 0) >= 1, dag_id
        assert dag.catchup is False, dag_id
        assert dag.tags and dag.doc_md, dag_id


def test_asset_wiring(dagbag):
    publish = dagbag.dags["shop_raw_ingest"].task_dict["publish_raw_assets"]
    assert set(publish.outlets) == set(assets.RAW.values())

    # AND condition: the transform waits for all three raw tables
    condition = dagbag.dags["shop_dbt_transform"].timetable.asset_condition
    assert type(condition).__name__ == "AssetAll"
    assert set(condition.objects) == set(assets.RAW.values())
    assert dagbag.dags["shop_dbt_transform"].task_dict["publish_mart"].outlets == [assets.MART_DAILY_REVENUE]

    report_condition = dagbag.dags["revenue_report"].timetable.asset_condition
    assert list(report_condition.objects) == [assets.MART_DAILY_REVENUE]


def test_cosmos_renders_one_task_per_dbt_model(dagbag):
    manifest = json.loads((DBT_PROJECT_DIR / "target" / "manifest.json").read_text())
    models = {n["name"] for n in manifest["nodes"].values() if n["resource_type"] == "model"}
    dbt_tasks = {
        t.task_id.removeprefix("dbt_shop.").removesuffix("_model_build"): t
        for t in dagbag.dags["shop_dbt_transform"].tasks
        if t.task_id.startswith("dbt_shop.")
    }
    assert set(dbt_tasks) == models
    assert all(t.pool == "warehouse" for t in dbt_tasks.values())
    # dbt lineage is preserved as Airflow dependencies
    assert "dbt_shop.fct_orders_model_build" in dbt_tasks["mart_daily_revenue"].upstream_task_ids
