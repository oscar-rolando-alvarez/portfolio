"""Lineage is a contract too: if a refactor breaks what the SQL parser can see, CI fails."""

import pytest
from airflow.models import DagBag
from openlineage_sql import parse

from tests.conftest import DAGS_FOLDER

EXPECTED = {
    "seed_raw": (set(), {"raw.customers", "raw.orders"}),
    "build_staging": ({"raw.orders", "raw.customers"}, {"staging.orders_enriched"}),
    "build_mart": ({"staging.orders_enriched"}, {"marts.daily_revenue_by_country"}),
}


@pytest.fixture(scope="module")
def dag(airflow_db):
    bag = DagBag(dag_folder=str(DAGS_FOLDER))
    assert bag.import_errors == {}
    return bag.dags["revenue_lineage"]


def test_platform_rules(dag):
    assert dag.default_args["owner"] and dag.default_args["retries"] >= 1
    assert dag.catchup is False and dag.tags and dag.doc_md


@pytest.mark.parametrize("task_id", list(EXPECTED))
def test_sql_lineage_is_extractable(dag, task_id):
    sql = (
        dag.task_dict[task_id]
        .sql.replace("{{ data_interval_start | ds }}", "2026-11-17")
        .replace("{{ data_interval_start | ds_nodash }}", "20261117")
    )
    statements = [s for s in sql.split(";") if s.strip()]
    meta = parse(statements, dialect="postgres")
    inputs = {t.qualified_name for t in meta.in_tables}
    outputs = {t.qualified_name for t in meta.out_tables}
    expected_in, expected_out = EXPECTED[task_id]
    assert expected_out <= outputs
    assert expected_in <= inputs | outputs  # DELETE/INSERT targets also appear as inputs


def test_column_lineage_reaches_the_mart(dag):
    sql = dag.task_dict["build_mart"].sql.replace("{{ data_interval_start | ds }}", "2026-11-17")
    insert = next(s for s in sql.split(";") if "INSERT INTO" in s)
    meta = parse([insert], dialect="postgres")
    revenue = next(c for c in meta.column_lineage if c.descendant.name == "revenue_usd")
    assert {(o.origin.name, o.name) for o in revenue.lineage} == {("orders_enriched", "amount_usd")}
