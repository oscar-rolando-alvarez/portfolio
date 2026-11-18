"""Query the local DuckDB warehouse from inside the stack.

docker compose exec airflow-scheduler python /opt/airflow/scripts/query.py "SELECT * FROM raw.orders LIMIT 5"
"""

import os
import sys

import duckdb

with duckdb.connect(os.getenv("DUCKDB_PATH", "/opt/airflow/data/warehouse.duckdb"), read_only=True) as con:
    result = con.execute(sys.argv[1] if len(sys.argv) > 1 else "SHOW ALL TABLES")
    print(" | ".join(d[0] for d in result.description))
    for row in result.fetchall():
        print(" | ".join(str(v) for v in row))
