from __future__ import annotations

import os

WAREHOUSE_POOL = "warehouse"


def data_root() -> str:
    return os.getenv("DATA_ROOT", "/opt/airflow/data")
