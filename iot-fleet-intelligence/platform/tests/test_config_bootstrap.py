from __future__ import annotations

from datetime import timedelta

import pytest
from pydantic import ValidationError

from conftest import T0
from fleetintel.adapters.memory import (
    InMemoryCache,
    InMemoryIncidentRepository,
    InMemoryQueue,
    InMemoryStateStore,
)
from fleetintel.bootstrap import build_container, get_container, set_container
from fleetintel.config import Settings
from fleetintel.diagnosis.llm import OpenAICompatibleChat
from fleetintel.domain import IncidentStatus, TelemetryEvent
from fleetintel.enrichment.providers import OpenMeteoWeather
from fleetintel.ports import StaleStateError
from test_resilience_enrichment import make_incident


def test_settings_from_env(settings_env: pytest.MonkeyPatch) -> None:
    settings_env.setenv("FLEETINTEL_WINDOW_SECONDS", "120")
    settings_env.setenv("FLEETINTEL_API_KEYS", "acme:" + "a" * 64)
    s = Settings()
    assert s.window_seconds == 120
    assert s.api_key_index() == {"a" * 64: "acme"}
    settings_env.setenv("FLEETINTEL_API_KEYS", "acme:short")
    with pytest.raises(ValidationError):
        Settings()


def test_live_and_openai_wiring_without_network() -> None:
    c = build_container(
        Settings(
            enrichment_mode="live",
            llm_provider="openai_compatible",
            llm_base_url="http://llm.local/v1",
        )
    )
    assert isinstance(c.diagnosis.llm, OpenAICompatibleChat)
    assert isinstance(c.enrichment.weather, OpenMeteoWeather)


def test_container_singleton_hooks() -> None:
    set_container(None)
    c = get_container()
    assert get_container() is c
    set_container(None)


def test_memory_repository_semantics() -> None:
    repo = InMemoryIncidentRepository()
    inc = make_incident()
    assert repo.upsert_incident(inc) is True
    assert repo.upsert_incident(inc) is False
    later = inc.model_copy(update={"last_seen_at": T0 + timedelta(hours=1), "windows": 4})
    repo.set_status(inc.incident_id, IncidentStatus.ENRICHED)
    repo.upsert_incident(later)
    got, _, _ = repo.get_bundle(inc.incident_id)
    assert got is not None and got.status is IncidentStatus.ENRICHED and got.windows == 4
    assert not repo.set_status("nope", IncidentStatus.RESOLVED)
    assert not repo.set_status(
        inc.incident_id, IncidentStatus.RESOLVED, expected={IncidentStatus.OPEN}
    )
    for n in range(3):
        repo.upsert_incident(
            inc.model_copy(
                update={"incident_id": f"inc-{n}", "opened_at": T0 + timedelta(minutes=n)}
            )
        )
    page, cur = repo.list_incidents("acme", None, 2, None)
    assert len(page) == 2 and cur == "2"
    page2, cur2 = repo.list_incidents("acme", None, 2, cur)
    assert len(page2) == 2 and cur2 is None
    assert (
        repo.list_incidents("acme", IncidentStatus.ENRICHED, 10, None)[0][0].incident_id
        == inc.incident_id
    )
    assert repo.ping()


def test_memory_state_queue_cache() -> None:
    store = InMemoryStateStore()
    store.save("s", {"x": 1}, 5, 0)
    with pytest.raises(StaleStateError):
        store.save("s", {"x": 2}, 6, 0)
    assert store.load("s").last_offset == 5
    q = InMemoryQueue()
    q.publish([{"a": 1}])
    assert q.drain() == [{"a": 1}] and q.drain() == []
    t = {"now": 0.0}
    cache = InMemoryCache(clock=lambda: t["now"])
    cache.put("k", {"v": 1}, 10)
    assert cache.get("k") == {"v": 1}
    t["now"] = 11
    assert cache.get("k") is None


def test_telemetry_schema_rejects_bad_input() -> None:
    good = make_event_dict()
    TelemetryEvent.model_validate(good)
    for field, bad in [
        ("device_id", "x; DROP"),
        ("rsrp", 10),
        ("v", 2),
        ("tenant", "UPPER"),
        ("cell_id", "abc"),
    ]:
        with pytest.raises(ValidationError):
            TelemetryEvent.model_validate({**good, field: bad})


def make_event_dict() -> dict[str, object]:
    from conftest import event

    return event().model_dump(mode="json")
