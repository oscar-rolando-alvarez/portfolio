"""Bronze -> silver -> gold on real Spark + Delta, including the failure modes."""

from datetime import date

import bronze_ingest
import generate_events
import gold_daily_metrics
import pytest
import silver_events
from pyspark.errors import AnalysisException
from pyspark.sql import functions as F

DAY1, DAY2 = date(2026, 11, 16), date(2026, 11, 17)


def land(lake, day):
    generate_events.write(lake.root, day)
    return day.isoformat()


def run_all(spark, lake, day):
    batch = land(lake, day)
    bronze = bronze_ingest.run(spark, lake, batch)
    silver = silver_events.run(spark, lake, batch)
    gold = gold_daily_metrics.run(spark, lake, batch)
    return bronze, silver, gold


def table(spark, lake, layer, name):
    return lake.read(spark, layer, name)


def test_bronze_keeps_every_line_and_is_idempotent(spark, lake):
    batch = land(lake, DAY1)
    lines = len(generate_events.generate(DAY1))
    assert bronze_ingest.run(spark, lake, batch) == lines
    bronze_ingest.run(spark, lake, batch)
    assert table(spark, lake, "bronze", "events").count() == lines


def test_silver_quarantines_dedupes_and_reruns_cleanly(spark, lake):
    _, silver, _ = run_all(spark, lake, DAY1)
    assert silver["quarantined"] > 0
    events = table(spark, lake, "silver", "events")
    assert events.count() == events.select("event_id").distinct().count() == silver["valid_unique"]
    reasons = {
        r for row in table(spark, lake, "silver", "events_quarantine").collect() for r in row["_problems"]
    }
    assert reasons <= {
        "unparseable_json",
        "missing_event_id",
        "missing_user_id",
        "bad_timestamp",
        "unknown_event_type",
        "purchase_without_amount",
    }

    before = events.count()
    run_all(spark, lake, DAY1)  # rerun the same batch
    assert table(spark, lake, "silver", "events").count() == before


def test_late_events_update_the_previous_days_gold(spark, lake):
    run_all(spark, lake, DAY1)
    gold_before = {r.event_date: r for r in table(spark, lake, "gold", "daily_metrics").collect()}
    _, silver, touched = run_all(spark, lake, DAY2)
    assert str(DAY1) in touched  # DAY2's batch carried late DAY1 events
    gold_after = {r.event_date: r for r in table(spark, lake, "gold", "daily_metrics").collect()}
    assert gold_after[DAY1].page_views + gold_after[DAY1].purchases >= (
        gold_before[DAY1].page_views + gold_before[DAY1].purchases
    )
    # gold equals a from-scratch recomputation over silver (no double counting)
    silver_df = table(spark, lake, "silver", "events")
    for day, row in gold_after.items():
        expected = silver_df.where(F.col("event_date") == day).where("event_type = 'page_view'").count()
        assert row.page_views == expected


def test_too_many_bad_records_stop_the_line(spark, lake):
    batch = land(lake, DAY1)
    bronze_ingest.run(spark, lake, batch)
    with pytest.raises(silver_events.DataQualityError):
        silver_events.run(spark, lake, batch, max_invalid_ratio=0.001)


def test_delta_enforces_the_silver_schema(spark, lake):
    run_all(spark, lake, DAY1)
    bad = spark.createDataFrame([("x", "not-a-date")], "event_id string, event_date string")
    with pytest.raises(AnalysisException):
        bad.write.format("delta").mode("append").save(lake.path("silver", "events"))


def test_every_write_is_a_versioned_commit(spark, lake):
    run_all(spark, lake, DAY1)
    run_all(spark, lake, DAY1)
    history = spark.sql(f"DESCRIBE HISTORY {lake.ref('gold', 'daily_metrics')}").collect()
    assert len(history) == 2  # time travel: VERSION AS OF 0 is the first run
    v0 = spark.read.format("delta").option("versionAsOf", 0).load(lake.path("gold", "daily_metrics"))
    assert v0.count() == table(spark, lake, "gold", "daily_metrics").count()
