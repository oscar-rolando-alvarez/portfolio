"""
### weather_daily_ingest

Downloads one day of hourly weather for a city from the public Open-Meteo API,
validates it and publishes it as a date-partitioned Parquet file.

* **Schedule:** daily, with a real *data interval* (`CronDataIntervalTimetable`).
  The run for the interval `2026-11-17 00:00 → 2026-11-18 00:00` processes 17 November.
* **Idempotent:** each run overwrites exactly one partition; reruns and backfills never duplicate data.
* **Light XCom:** tasks exchange file paths and a small quality report, never the data itself.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pendulum
from airflow.sdk import CronDataIntervalTimetable, Param, dag, task
from airflow.sdk.exceptions import AirflowFailException

from include.weather import quality, source, storage


@dag(
    dag_id="weather_daily_ingest",
    # Airflow 3 changed the default for cron schedules to CronTriggerTimetable, where
    # data_interval_start == data_interval_end. We want "process yesterday" semantics,
    # so we ask for a data-interval timetable explicitly.
    schedule=CronDataIntervalTimetable("0 2 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 11, 1, tz="UTC"),
    catchup=False,
    max_active_runs=3,
    default_args={
        "owner": "data-platform",
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
        "retry_exponential_backoff": True,
        "execution_timeout": timedelta(minutes=10),
    },
    params={"city": Param("bogota", type="string", enum=sorted(source.CITIES))},
    tags=["level-1", "ingestion", "weather"],
    doc_md=__doc__,
)
def weather_daily_ingest():
    @task
    def extract(params=None, data_interval_start=None) -> str:
        """Land the source file untouched in the raw zone and return its path."""
        city = source.CITIES[params["city"]]
        day = data_interval_start.date()
        raw_csv = source.fetch_hourly_csv(city, day)
        return str(storage.write_raw(raw_csv, city.name, day))

    @task
    def validate(raw_path: str, data_interval_start=None) -> dict:
        """Data-quality gate. A failed check is not retryable, so fail fast."""
        frame = quality.parse_open_meteo_csv(Path(raw_path).read_text(encoding="utf-8"))
        try:
            report = quality.validate(frame, data_interval_start.date())
        except quality.DataQualityError as exc:
            raise AirflowFailException(f"Data quality check failed: {exc}") from exc
        return report.to_dict()

    @task
    def publish(raw_path: str, report: dict, params=None, data_interval_start=None) -> str:
        """Write the curated Parquet partition (atomic overwrite)."""
        frame = quality.parse_open_meteo_csv(Path(raw_path).read_text(encoding="utf-8"))
        target = storage.write_curated(frame, params["city"], data_interval_start.date())
        print(f"Published {report['rows']} rows to {target}: {report}")
        return str(target)

    raw = extract()
    publish(raw, validate(raw))


weather_daily_ingest()
