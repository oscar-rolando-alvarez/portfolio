"""End-to-end Lambda handler tests against moto (DynamoDB single table + SQS)."""

from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import boto3
import pytest
from moto import mock_aws

from conftest import T0, stream
from fleetintel.adapters.dynamodb import (
    DynamoCache,
    DynamoIncidentRepository,
    DynamoStateStore,
    create_table,
)
from fleetintel.adapters.sqs import SqsJobQueue
from fleetintel.bootstrap import Container, build_container, set_container
from fleetintel.config import Settings
from fleetintel.domain import IncidentStatus
from fleetintel.handlers import api, workers
from fleetintel.handlers import stream as stream_handler
from fleetintel.ports import StaleStateError
from test_resilience_enrichment import make_incident

API_KEY = "fk-acme-demo-key"
OTHER_KEY = "fk-globex-demo-key"


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


@pytest.fixture
def aws() -> Iterator[Container]:
    with mock_aws():
        ddb = boto3.client("dynamodb", region_name="us-east-1")
        sqs = boto3.client("sqs", region_name="us-east-1")
        create_table(ddb, "fleetintel")
        create_table(ddb, "fleetintel")  # idempotent
        urls = {
            n: sqs.create_queue(QueueName=n)["QueueUrl"] for n in ("enrich", "diag", "quarantine")
        }
        settings = Settings(
            backend="aws",
            table_name="fleetintel",
            enrichment_queue_url=urls["enrich"],
            diagnosis_queue_url=urls["diag"],
            quarantine_queue_url=urls["quarantine"],
            api_keys=f"acme:{sha(API_KEY)},globex:{sha(OTHER_KEY)}",
        )
        c = build_container(settings)
        set_container(c)
        yield c
        set_container(None)


def drain(c: Container, url: str) -> list[dict[str, Any]]:
    sqs = boto3.client("sqs", region_name="us-east-1")
    out = []
    while True:
        msgs = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10).get("Messages", [])
        if not msgs:
            return out
        for m in msgs:
            out.append(
                {
                    "messageId": m["MessageId"],
                    "receiptHandle": m["ReceiptHandle"],
                    "body": m["Body"],
                    "attributes": {"ApproximateReceiveCount": "1"},
                    "messageAttributes": {},
                    "md5OfBody": m["MD5OfBody"],
                    "eventSource": "aws:sqs",
                    "eventSourceARN": "arn:aws:sqs:us-east-1:123456789012:q",
                    "awsRegion": "us-east-1",
                }
            )
            sqs.delete_message(QueueUrl=url, ReceiptHandle=m["ReceiptHandle"])


def outage(_: int, kw: dict[str, Any]) -> None:
    kw.update(conn_state="no_service", rsrp=-140.0, sinr=-20.0, latency_ms=0)


def kafka_batches(events: list[Any], size: int = 200) -> list[dict[str, Any]]:
    lines = [e.model_dump_json().encode() for e in events]
    return [
        stream_handler.kafka_event(
            [
                ("telemetry", 0, off, lines[off], b"cell")
                for off in range(i, min(i + size, len(lines)))
            ]
        )
        for i in range(0, len(lines), size)
    ]


def api_call(
    method: str,
    path: str,
    key: str | None = API_KEY,
    query: dict[str, str] | None = None,
    body: Any = None,
) -> dict[str, Any]:
    event = {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": path,
        "rawQueryString": "&".join(f"{k}={v}" for k, v in (query or {}).items()),
        "headers": {"x-api-key": key} if key else {},
        "queryStringParameters": query,
        "requestContext": {
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "t",
            },
            "requestId": "r",
            "routeKey": "$default",
            "stage": "$default",
            "accountId": "1",
            "apiId": "a",
            "domainName": "x",
            "domainPrefix": "x",
            "time": "01/Jan/2026:00:00:00 +0000",
            "timeEpoch": 0,
        },
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }
    resp = api.app.resolve(event, None)  # type: ignore[arg-type]
    return {
        "status": resp["statusCode"],
        "body": json.loads(resp["body"]) if resp.get("body") else None,
    }


def test_full_pipeline_kafka_to_api(aws: Container) -> None:
    events = stream(windows=20, fault=outage, fault_from=10)
    opened: list[str] = []
    for ev in kafka_batches(events):
        opened += stream_handler.process_kafka_event(ev, aws)["opened"]
    assert len(opened) == 1
    incident_id = opened[0]

    # replaying the same batches is a no-op thanks to offset fencing
    replay = stream_handler.process_kafka_event(kafka_batches(events)[0], aws)
    assert replay["skipped_replayed"] == 200 and replay["opened"] == []

    jobs = drain(aws, aws.settings.enrichment_queue_url)
    assert [json.loads(j["body"])["incident_id"] for j in jobs] == [incident_id]
    # duplicate delivery of the same job: idempotency makes the second a no-op
    resp = workers.process_enrichment({"Records": jobs + jobs}, aws)
    assert resp == {"batchItemFailures": []}
    diag_jobs = drain(aws, aws.settings.diagnosis_queue_url)
    assert len(diag_jobs) == 1
    assert workers.process_diagnosis({"Records": diag_jobs}, aws) == {"batchItemFailures": []}

    listing = api_call("GET", "/v1/incidents")
    assert listing["status"] == 200 and [i["incident_id"] for i in listing["body"]["items"]] == [
        incident_id
    ]
    by_status = api_call("GET", "/v1/incidents", query={"status": "diagnosed"})
    assert by_status["body"]["items"][0]["status"] == "DIAGNOSED"
    detail = api_call("GET", f"/v1/incidents/{incident_id}")
    assert detail["status"] == 200
    assert detail["body"]["diagnosis"]["diagnosis"]["root_cause"] == "cell_outage"
    assert {i["source"] for i in detail["body"]["enrichment"]["items"]} == {
        "carrier",
        "celltower",
        "status_feed",
        "weather",
    }
    assert detail["body"]["incident"]["windows"] == 9  # last window still open (watermark)


def test_poison_records_are_quarantined_not_retried(aws: Container) -> None:
    good = stream(windows=1, devices=3)
    lines = [
        good[0].model_dump_json().encode(),
        b'{"v":1,"device_id":"nope"}',
        b"not json",
        good[1].model_dump_json().encode(),
    ]
    event = stream_handler.kafka_event(
        [("telemetry", 3, i, line, None) for i, line in enumerate(lines)]
    )
    out = stream_handler.process_kafka_event(event, aws)
    assert out["events"] == 2 and out["invalid"] == 2
    quarantined = drain(aws, aws.settings.quarantine_queue_url)
    assert len(quarantined) == 2
    assert json.loads(quarantined[0]["body"])["shard"] == "telemetry#3"


def test_sqs_telemetry_ingestion(aws: Container) -> None:
    events = stream(windows=20, fault=outage, fault_from=10)
    records = []
    for i in range(0, len(events), 40):
        body = "\n".join(e.model_dump_json() for e in events[i : i + 40])
        records.append({"body": body, "attributes": {"MessageGroupId": "cell-1"}})
    out = stream_handler.process_sqs_telemetry({"Records": records}, aws)
    assert out["events"] == 800 and out["opened"] == 1


def test_worker_reports_partial_failures(aws: Container) -> None:
    aws.repo.upsert_incident(make_incident())
    missing = {"incident_id": "inc-doesnotexist000000", "tenant": "acme"}
    ok = {"incident_id": "inc-test", "tenant": "acme"}
    records = [
        {
            "messageId": "0",
            "receiptHandle": "r",
            "body": json.dumps(ok),
            "attributes": {},
            "messageAttributes": {},
            "md5OfBody": "",
            "eventSource": "aws:sqs",
            "eventSourceARN": "arn",
            "awsRegion": "us-east-1",
        },
        {
            "messageId": "1",
            "receiptHandle": "r",
            "body": json.dumps(missing),
            "attributes": {},
            "messageAttributes": {},
            "md5OfBody": "",
            "eventSource": "aws:sqs",
            "eventSourceARN": "arn",
            "awsRegion": "us-east-1",
        },
        {
            "messageId": "2",
            "receiptHandle": "r",
            "body": "{bad json",
            "attributes": {},
            "messageAttributes": {},
            "md5OfBody": "",
            "eventSource": "aws:sqs",
            "eventSourceARN": "arn",
            "awsRegion": "us-east-1",
        },
    ]
    resp = workers.process_enrichment({"Records": records}, aws)
    assert sorted(f["itemIdentifier"] for f in resp["batchItemFailures"]) == ["1", "2"]
    # an entirely failed batch raises so the event source mapping retries it
    with pytest.raises(Exception, match="All records failed"):
        workers.process_enrichment({"Records": records[1:]}, aws)


def test_api_auth_and_tenant_isolation(aws: Container) -> None:
    inc = make_incident()
    aws.repo.upsert_incident(inc)
    assert api_call("GET", "/health", key=None)["body"]["status"] == "ok"
    assert api_call("GET", "/ready", key=None)["body"] == {"ready": True}
    assert api_call("GET", "/v1/incidents", key=None)["status"] == 401
    assert api_call("GET", "/v1/incidents", key="wrong")["status"] == 401
    assert api_call("GET", f"/v1/incidents/{inc.incident_id}", key=OTHER_KEY)["status"] == 404
    assert api_call("GET", "/v1/incidents", key=OTHER_KEY)["body"]["items"] == []
    assert api_call("GET", "/v1/incidents/not-an-id")["status"] == 404
    assert api_call("GET", "/v1/incidents", query={"status": "weird"})["status"] == 400
    assert api_call("GET", "/v1/incidents", query={"limit": "x"})["status"] == 400
    assert api_call("GET", "/v1/incidents", query={"cursor": "garbage!!"})["status"] == 400


def test_api_cost_endpoints(aws: Container) -> None:
    r = api_call(
        "POST", "/v1/cost/estimate", body={"devices": 250000, "report_interval_seconds": 600}
    )
    assert r["status"] == 200 and float(r["body"]["total_usd"]) > 0
    assert api_call("POST", "/v1/cost/estimate", body={"devices": -1})["status"] == 400
    s = api_call("GET", "/v1/cost/scenarios")
    assert [x["devices"] for x in s["body"]["scenarios"]] == [10_000, 1_000_000, 10_000_000]


def test_repository_pagination_status_and_upsert(aws: Container) -> None:
    repo: DynamoIncidentRepository = aws.repo  # type: ignore[assignment]
    for n in range(5):
        inc = make_incident().model_copy(
            update={"incident_id": f"inc-{n:04d}", "opened_at": T0 + timedelta(minutes=n)}
        )
        assert repo.upsert_incident(inc) is True
    page1, cur = repo.list_incidents("acme", None, 2, None)
    page2, _ = repo.list_incidents("acme", None, 2, cur)
    assert [i.incident_id for i in page1] == ["inc-0004", "inc-0003"]
    assert [i.incident_id for i in page2] == ["inc-0002", "inc-0001"]
    with pytest.raises(ValueError, match="invalid cursor"):
        repo.list_incidents("globex", None, 2, cur)  # cursor from another tenant
    assert repo.set_status("inc-0001", IncidentStatus.ENRICHED, expected={IncidentStatus.OPEN})
    assert not repo.set_status("inc-0001", IncidentStatus.ENRICHED, expected={IncidentStatus.OPEN})
    assert not repo.set_status("inc-missing", IncidentStatus.ENRICHED)
    # extending an episode never regresses status or last_seen_at
    later = make_incident().model_copy(
        update={"incident_id": "inc-0001", "windows": 7, "last_seen_at": T0 + timedelta(hours=1)}
    )
    assert repo.upsert_incident(later) is False
    stale = later.model_copy(update={"windows": 2, "last_seen_at": T0})
    assert repo.upsert_incident(stale) is False
    cur_inc, _, _ = repo.get_bundle("inc-0001")
    assert (
        cur_inc is not None and cur_inc.windows == 7 and cur_inc.status is IncidentStatus.ENRICHED
    )
    assert repo.ping()


def test_state_store_optimistic_locking_and_cache(aws: Container) -> None:
    ddb = boto3.client("dynamodb", region_name="us-east-1")
    store = DynamoStateStore(ddb, "fleetintel")
    assert store.load("t#0").version == 0
    store.save("t#0", {"a": 1}, last_offset=10, expected_version=0)
    loaded = store.load("t#0")
    assert loaded.state == {"a": 1} and loaded.version == 1 and loaded.last_offset == 10
    with pytest.raises(StaleStateError):
        store.save("t#0", {"a": 2}, last_offset=11, expected_version=0)
    with pytest.raises(ValueError, match="detector state"):
        store.save("t#0", {"blob": os.urandom(400_000).hex()}, 12, 1)

    t = {"now": 1000.0}
    cache = DynamoCache(ddb, "fleetintel", clock=lambda: t["now"])
    cache.put("weather#1,2", {"x": 1}, ttl_seconds=60)
    assert cache.get("weather#1,2") == {"x": 1}
    t["now"] += 61
    assert cache.get("weather#1,2") is None
    assert cache.get("missing") is None


def test_sqs_queue_batches_of_ten(aws: Container) -> None:
    sqs = boto3.client("sqs", region_name="us-east-1")
    url = sqs.create_queue(QueueName="t")["QueueUrl"]
    SqsJobQueue(sqs, url).publish([{"n": i} for i in range(23)])
    assert len(drain(aws, url)) == 23
