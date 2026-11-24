from datetime import date

import pytest

from include.weather import quality, source

DAY = date(2026, 11, 17)


def _frame(day: date = DAY):
    raw = source.fetch_hourly_csv(source.CITIES["bogota"], day, mode="fixture")
    return quality.parse_open_meteo_csv(raw)


def test_fixture_passes_all_rules():
    report = quality.validate(_frame(), DAY)
    assert report.rows == 24
    assert report.min_temperature_c <= report.max_temperature_c


def test_fixture_is_redated_to_any_requested_day():
    other = date(2026, 1, 5)
    assert quality.validate(_frame(other), other).rows == 24


def test_missing_hours_are_rejected():
    with pytest.raises(quality.DataQualityError, match="expected 24 hourly rows"):
        quality.validate(_frame().iloc[:20], DAY)


def test_rows_from_another_day_are_rejected():
    with pytest.raises(quality.DataQualityError, match="outside 2026-11-18"):
        quality.validate(_frame(), date(2026, 11, 18))


def test_implausible_values_and_nulls_are_rejected():
    frame = _frame()
    frame.loc[0, "temperature_c"] = 99.0
    frame.loc[1, "wind_speed_kmh"] = None
    with pytest.raises(quality.DataQualityError) as err:
        quality.validate(frame, DAY)
    assert "temperature_c outside" in str(err.value)
    assert "null values in wind_speed_kmh" in str(err.value)


def test_schema_drift_is_detected():
    raw = source.fetch_hourly_csv(source.CITIES["bogota"], DAY, mode="fixture")
    with pytest.raises(quality.DataQualityError, match="Schema drift"):
        quality.parse_open_meteo_csv(raw.replace("precipitation (mm)", "rain (mm)"))


def test_api_request_parameters():
    params = source.build_params(source.CITIES["bogota"], DAY)
    assert params["start_date"] == params["end_date"] == "2026-11-17"
    assert params["timezone"] == "UTC" and params["format"] == "csv"
