"""Gold: recompute daily product metrics for every event_date touched by this batch.

Late events (yesterday's events in today's batch) change yesterday's numbers, so the
job recomputes all affected dates from silver and replaces just those partitions.
"""

from __future__ import annotations

from pyspark.sql import functions as F

from lib.cli import parse_args
from lib.session import get_spark
from lib.transforms import daily_metrics


def run(spark, tables, batch_date: str) -> list[str]:
    silver = tables.read(spark, "silver", "events")
    touched = [
        str(r.event_date)
        for r in silver.where(F.col("_batch_date") == batch_date).select("event_date").distinct().collect()
    ]
    if not touched:
        return []
    metrics = daily_metrics(silver.where(F.col("event_date").isin(touched)))
    predicate = "event_date IN (" + ", ".join(f"DATE'{d}'" for d in sorted(touched)) + ")"
    tables.overwrite_partition(metrics, "gold", "daily_metrics", predicate, ["event_date"])
    return sorted(touched)


if __name__ == "__main__":
    args, tables = parse_args(__doc__)
    spark = get_spark("gold_daily_metrics")
    print(f"gold {args.batch_date}: recomputed {run(spark, tables, args.batch_date)}")
