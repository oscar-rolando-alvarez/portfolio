"""Integration test against a real Kafka broker (CI service container / docker compose).

Produces telemetry to a fresh topic, consumes it with the same batching the
local runner uses, and pushes MSK-shaped events through the stream Lambda
handler. Skipped unless KAFKA_BOOTSTRAP is set.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

import pytest

from conftest import stream
from fleetintel.bootstrap import build_container
from fleetintel.config import Settings
from fleetintel.handlers.stream import flush_shard, kafka_event, process_kafka_event

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP")
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not BOOTSTRAP, reason="set KAFKA_BOOTSTRAP to run Kafka integration tests"),
]


def outage(_: int, kw: dict[str, Any]) -> None:
    kw.update(conn_state="no_service", rsrp=-140.0, sinr=-20.0, latency_ms=0)


def test_kafka_roundtrip_through_stream_handler() -> None:
    from confluent_kafka import Consumer, Producer
    from confluent_kafka.admin import AdminClient, NewTopic

    topic = f"fleet.telemetry.it.{uuid.uuid4().hex[:8]}"
    admin = AdminClient({"bootstrap.servers": BOOTSTRAP})
    admin.create_topics([NewTopic(topic, num_partitions=3, replication_factor=1)])[topic].result(
        timeout=30
    )

    events = stream(windows=20, fault=outage, fault_from=10)
    producer = Producer({"bootstrap.servers": BOOTSTRAP, "linger.ms": 5})
    for e in events:
        producer.produce(topic, key=e.cell_id.encode(), value=e.model_dump_json().encode())
    assert producer.flush(30) == 0

    c = build_container(Settings())
    consumer = Consumer(
        {
            "bootstrap.servers": BOOTSTRAP,
            "group.id": f"it-{uuid.uuid4().hex[:6]}",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    consumer.subscribe([topic])
    seen, opened, partitions = 0, [], set()
    deadline = time.time() + 60
    while seen < len(events) and time.time() < deadline:
        msgs = [m for m in consumer.consume(num_messages=300, timeout=1.0) if m.error() is None]
        if not msgs:
            continue
        records = [(m.topic(), m.partition(), m.offset(), m.value(), m.key()) for m in msgs]
        partitions |= {m.partition() for m in msgs}
        out = process_kafka_event(kafka_event(records), c)  # type: ignore[arg-type]
        consumer.commit(asynchronous=False)
        seen += out["events"]
        opened += out["opened"]
    consumer.close()
    for p in partitions:
        opened += flush_shard(f"{topic}#{p}", c).opened

    assert seen == len(events)
    # all events share one cell key -> one partition -> exactly one incident
    assert len(partitions) == 1
    assert len(opened) == 1
    inc, _, _ = c.repo.get_bundle(opened[0])
    assert inc is not None and inc.suspected_fault.value == "cell_outage"
