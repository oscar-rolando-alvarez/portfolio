"""Run one Spark SQL statement against the local lake (used by `make sql`).

Every Delta table under LAKE_ROOT is registered as a view named <layer>_<table>,
e.g. bronze_events, silver_events, silver_events_quarantine, gold_daily_metrics.
"""

import os
import sys
from pathlib import Path

from lib.session import get_spark

spark = get_spark("sql")
spark.sparkContext.setLogLevel("ERROR")
root = Path(os.getenv("LAKE_ROOT", "/lake"))
for layer in ("bronze", "silver", "gold"):
    for table in sorted((root / layer).glob("*/_delta_log")):
        name = f"{layer}_{table.parent.name}"
        spark.read.format("delta").load(str(table.parent)).createOrReplaceTempView(name)
spark.sql(sys.argv[1] if len(sys.argv) > 1 else "SHOW VIEWS").show(50, truncate=False)
