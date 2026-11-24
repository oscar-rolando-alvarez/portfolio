from datetime import date

import pandas as pd

from include.weather import quality, source, storage

DAY = date(2026, 11, 17)


def test_partitions_are_hive_style(tmp_path):
    path = storage.partition_dir("curated", "bogota", DAY, tmp_path)
    assert path == tmp_path / "curated" / "weather" / "city=bogota" / "date=2026-11-17"


def test_rewriting_a_partition_is_idempotent(tmp_path):
    raw = source.fetch_hourly_csv(source.CITIES["bogota"], DAY, mode="fixture")
    frame = quality.parse_open_meteo_csv(raw)
    first = storage.write_curated(frame, "bogota", DAY, tmp_path)
    second = storage.write_curated(frame, "bogota", DAY, tmp_path)
    assert first == second
    assert len(pd.read_parquet(second)) == 24
    # no temp files left behind
    assert [p.name for p in second.parent.iterdir()] == ["hourly.parquet"]
