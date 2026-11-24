"""Bronze: land the day's raw JSON lines in Delta, untouched, with lineage columns.

Idempotent: replaceWhere on _batch_date rewrites exactly this batch.
(On Databricks, Auto Loader / COPY INTO would replace the read; the contract is the same.)
"""

from __future__ import annotations

from lib.cli import parse_args
from lib.session import get_spark
from lib.transforms import to_bronze


def run(spark, tables, batch_date: str) -> int:
    raw = spark.read.text(tables.landing("events", batch_date))
    bronze = to_bronze(raw, batch_date)
    tables.overwrite_partition(bronze, "bronze", "events", f"_batch_date = '{batch_date}'", ["_batch_date"])
    return bronze.count()


if __name__ == "__main__":
    args, tables = parse_args(__doc__)
    spark = get_spark("bronze_ingest")
    print(f"bronze rows for {args.batch_date}: {run(spark, tables, args.batch_date)}")
