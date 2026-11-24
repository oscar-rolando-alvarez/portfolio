"""Silver: parse, validate, quarantine bad records, dedupe and MERGE (insert-only) by event_id.

* Invalid rows go to silver.events_quarantine with the reasons, never silently dropped.
* The batch fails if the invalid ratio exceeds --max-invalid-ratio (a broken producer
  should stop the line, not leak into gold).
* MERGE ... WHEN NOT MATCHED THEN INSERT makes the write idempotent and also absorbs
  duplicates that arrive in a *later* batch.
"""

from __future__ import annotations

from lib.cli import parse_args
from lib.session import get_spark
from lib.transforms import dedupe, parse_events, split_valid


class DataQualityError(RuntimeError):
    pass


def run(spark, tables, batch_date: str, max_invalid_ratio: float = 0.05) -> dict:
    bronze = tables.read(spark, "bronze", "events").where(f"_batch_date = '{batch_date}'")
    valid, quarantine = split_valid(parse_events(bronze))
    valid = dedupe(valid).cache()

    total, bad = bronze.count(), quarantine.count()
    if total and bad / total > max_invalid_ratio:
        raise DataQualityError(f"{bad}/{total} invalid events exceed the {max_invalid_ratio:.0%} threshold")

    tables.overwrite_partition(
        quarantine, "silver", "events_quarantine", f"_batch_date = '{batch_date}'", ["_batch_date"]
    )
    if not tables.exists(spark, "silver", "events"):
        tables.create(valid.limit(0), "silver", "events", ["event_date"])
    valid.createOrReplaceTempView("batch_events")
    spark.sql(
        f"""
        MERGE INTO {tables.ref("silver", "events")} AS t
        USING batch_events AS s
        ON t.event_id = s.event_id AND t.event_date = s.event_date
        WHEN NOT MATCHED THEN INSERT *
        """
    )
    dates = sorted(str(r.event_date) for r in valid.select("event_date").distinct().collect())
    return {"bronze": total, "quarantined": bad, "valid_unique": valid.count(), "event_dates": dates}


if __name__ == "__main__":
    args, tables = parse_args(
        __doc__, lambda p: p.add_argument("--max-invalid-ratio", type=float, default=0.05)
    )
    spark = get_spark("silver_events")
    print(f"silver {args.batch_date}: {run(spark, tables, args.batch_date, args.max_invalid_ratio)}")
