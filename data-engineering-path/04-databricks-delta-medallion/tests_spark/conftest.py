import os
import sys
from pathlib import Path

import pytest

JOBS = Path(__file__).resolve().parents[1] / "jobs"
sys.path.insert(0, str(JOBS))
os.environ["LOCAL_DELTA"] = "1"
os.environ.setdefault("SPARK_MASTER", "local[2]")


@pytest.fixture(scope="session")
def spark():
    from lib.session import get_spark

    session = get_spark("tests")
    yield session
    session.stop()


@pytest.fixture
def lake(tmp_path):
    from lib.tables import Tables

    return Tables(root=str(tmp_path / "lake"))
