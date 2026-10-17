"""Local stand-in for the AWS event source mappings and API Gateway.

Runs the *same Lambda handlers* that ship to AWS:

* a Kafka consumer that batches records per partition, builds MSK-shaped
  events and invokes the stream processor (commits offsets after success),
* SQS long-pollers for the enrichment and diagnosis queues that invoke the
  workers and delete only the messages not reported in ``batchItemFailures``,
* a tiny HTTP server translating requests into API Gateway v2 events.

It also bootstraps local infrastructure (DynamoDB table, queues with DLQ
redrive) against moto-server, and exports OpenTelemetry traces to Jaeger.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import signal
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qsl, urlsplit

log = logging.getLogger("fleetintel.local")


@dataclass
class LocalContext:
    """Minimal LambdaContext so Powertools decorators behave as in AWS."""

    function_name: str
    memory_limit_in_mb: int = 512
    timeout_ms: int = 60_000
    aws_request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    started: float = field(default_factory=time.monotonic)

    @property
    def invoked_function_arn(self) -> str:
        return f"arn:aws:lambda:us-east-1:000000000000:function:{self.function_name}"

    @property
    def function_version(self) -> str:
        return "$LATEST"

    def get_remaining_time_in_millis(self) -> int:
        return max(0, self.timeout_ms - int((time.monotonic() - self.started) * 1000))


def setup_tracing() -> None:
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(
        resource=Resource.create({"service.name": os.getenv("OTEL_SERVICE_NAME", "fleetintel")})
    )
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint.rstrip('/')}/v1/traces"))
    )
    trace.set_tracer_provider(provider)
    log.info("OpenTelemetry traces -> %s", endpoint)


def bootstrap_infra(endpoint: str | None, table: str) -> dict[str, str]:
    import boto3

    from fleetintel.adapters.dynamodb import create_table

    ddb = boto3.client("dynamodb", endpoint_url=endpoint)
    sqs = boto3.client("sqs", endpoint_url=endpoint)
    create_table(ddb, table)
    urls: dict[str, str] = {}
    for name in ("enrichment", "diagnosis", "quarantine"):
        dlq = sqs.create_queue(QueueName=f"fleetintel-{name}-dlq")["QueueUrl"]
        dlq_arn = sqs.get_queue_attributes(QueueUrl=dlq, AttributeNames=["QueueArn"])["Attributes"][
            "QueueArn"
        ]
        urls[name] = sqs.create_queue(
            QueueName=f"fleetintel-{name}",
            Attributes={
                "VisibilityTimeout": "60",
                "RedrivePolicy": json.dumps(
                    {"deadLetterTargetArn": dlq_arn, "maxReceiveCount": "5"}
                ),
            },
        )["QueueUrl"]
    return urls


def kafka_loop(
    stop: threading.Event,
    brokers: str,
    topic: str,
    batch: int,
    invoke: Callable[[dict[str, Any]], Any],
) -> None:
    from confluent_kafka import Consumer, KafkaError

    from fleetintel.handlers.stream import kafka_event

    conf = {
        "bootstrap.servers": brokers,
        "group.id": "fleetintel-stream-processor",
        "enable.auto.commit": False,
        "auto.offset.reset": "earliest",
        "topic.metadata.refresh.interval.ms": 5000,
    }
    while not stop.is_set():
        consumer = Consumer(conf)
        consumer.subscribe([topic])
        log.info("consuming %s from %s", topic, brokers)
        try:
            while not stop.is_set():
                msgs = consumer.consume(num_messages=batch, timeout=1.0)
                records = []
                for m in msgs:
                    err = m.error()
                    if err is not None:
                        if err.code() != KafkaError._PARTITION_EOF:
                            log.warning("kafka: %s", err)
                        continue
                    records.append(
                        (
                            str(m.topic()),
                            int(m.partition() or 0),
                            int(m.offset() or 0),
                            m.value() or b"",
                            m.key(),
                        )
                    )
                if not records:
                    continue
                result = invoke(kafka_event(records))
                consumer.commit(asynchronous=False)  # like the ESM: commit only after success
                if result.get("opened"):
                    log.info("stream: %s events, opened %s", result.get("events"), result["opened"])
        except Exception:
            # Like a failed ESM invocation: rewind to the last committed offset and retry.
            log.exception("stream batch failed; restarting consumer from committed offsets")
            time.sleep(2)
        finally:
            consumer.close()


def sqs_loop(
    stop: threading.Event,
    endpoint: str | None,
    url: str,
    invoke: Callable[[dict[str, Any]], Any],
    name: str,
) -> None:
    import boto3

    sqs = boto3.client("sqs", endpoint_url=endpoint)
    while not stop.is_set():
        resp = sqs.receive_message(
            QueueUrl=url, MaxNumberOfMessages=10, WaitTimeSeconds=2, AttributeNames=["All"]
        )
        msgs = resp.get("Messages", [])
        if not msgs:
            continue
        event = {
            "Records": [
                {
                    "messageId": m["MessageId"], "receiptHandle": m["ReceiptHandle"], "body": m["Body"],
                    "attributes": m.get("Attributes", {}), "messageAttributes": {}, "md5OfBody": m["MD5OfBody"],
                    "eventSource": "aws:sqs", "eventSourceARN": f"arn:aws:sqs:us-east-1:000000000000:{name}",
                    "awsRegion": "us-east-1",
                }
                for m in msgs
            ]
        }  # fmt: skip
        try:
            result = invoke(event)
            failed = {f["itemIdentifier"] for f in result.get("batchItemFailures", [])}
        except Exception:
            log.exception("%s: whole batch failed; messages will be retried", name)
            continue
        for m in msgs:
            if m["MessageId"] not in failed:
                sqs.delete_message(QueueUrl=url, ReceiptHandle=m["ReceiptHandle"])
        log.info("%s: processed %d message(s), %d failed", name, len(msgs), len(failed))


def make_http_handler(
    invoke: Callable[[dict[str, Any]], dict[str, Any]],
) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _serve(self) -> None:
            parts = urlsplit(self.path)
            length = int(self.headers.get("content-length") or 0)
            body = self.rfile.read(length).decode() if length else None
            query = dict(parse_qsl(parts.query)) or None
            event = {
                "version": "2.0", "routeKey": "$default", "rawPath": parts.path, "rawQueryString": parts.query,
                "headers": {k.lower(): v for k, v in self.headers.items()}, "queryStringParameters": query,
                "requestContext": {
                    "http": {"method": self.command, "path": parts.path, "protocol": "HTTP/1.1",
                             "sourceIp": self.client_address[0], "userAgent": self.headers.get("user-agent", "")},
                    "requestId": str(uuid.uuid4()), "routeKey": "$default", "stage": "$default",
                    "accountId": "000000000000", "apiId": "local", "domainName": "localhost",
                    "domainPrefix": "localhost", "time": "", "timeEpoch": int(time.time() * 1000),
                },
                "body": body, "isBase64Encoded": False,
            }  # fmt: skip
            resp = invoke(event)
            self.send_response(int(resp["statusCode"]))
            for k, v in (resp.get("headers") or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if resp.get("body"):
                self.wfile.write(resp["body"].encode())

        do_GET = _serve  # noqa: N815
        do_POST = _serve  # noqa: N815
        do_OPTIONS = _serve  # noqa: N815

        def log_message(self, fmt: str, *args: Any) -> None:
            log.debug("api: " + fmt, *args)

    return Handler


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="fleetintel-local")
    ap.add_argument("--kafka-brokers", default=os.getenv("KAFKA_BROKERS", "localhost:29092"))
    ap.add_argument("--topic", default=os.getenv("KAFKA_TOPIC", "fleet.telemetry.v1"))
    ap.add_argument("--batch", type=int, default=int(os.getenv("STREAM_BATCH_SIZE", "5000")))
    ap.add_argument("--port", type=int, default=int(os.getenv("API_PORT", "8080")))
    ap.add_argument("--no-kafka", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    endpoint = os.getenv("FLEETINTEL_AWS_ENDPOINT_URL")
    table = os.getenv("FLEETINTEL_TABLE_NAME", "fleetintel")
    urls = bootstrap_infra(endpoint, table)
    os.environ.update(
        {
            "FLEETINTEL_BACKEND": "aws",
            "FLEETINTEL_ENRICHMENT_QUEUE_URL": urls["enrichment"],
            "FLEETINTEL_DIAGNOSIS_QUEUE_URL": urls["diagnosis"],
            "FLEETINTEL_QUARANTINE_QUEUE_URL": urls["quarantine"],
        }
    )
    setup_tracing()

    from fleetintel.handlers import api, stream, workers

    def lambda_invoker(
        fn: Callable[[dict[str, Any], Any], Any], name: str
    ) -> Callable[[dict[str, Any]], Any]:
        def run(event: dict[str, Any]) -> Any:
            try:
                return fn(event, LocalContext(function_name=name))
            finally:
                # With POWERTOOLS_METRICS_DISABLED the decorator skips its flush but keeps
                # buffering; clear so long-running local processes do not accumulate.
                stream.metrics.clear_metrics()
                workers.metrics.clear_metrics()

        return run

    stop = threading.Event()
    threads = [
        threading.Thread(
            target=sqs_loop,
            args=(
                stop,
                endpoint,
                urls["enrichment"],
                lambda_invoker(workers.enrichment_handler, "fleetintel-enrichment"),
                "enrichment",
            ),
            daemon=True,
        ),
        threading.Thread(
            target=sqs_loop,
            args=(
                stop,
                endpoint,
                urls["diagnosis"],
                lambda_invoker(workers.diagnosis_handler, "fleetintel-diagnosis"),
                "diagnosis",
            ),
            daemon=True,
        ),
    ]
    if not args.no_kafka:
        threads.append(
            threading.Thread(
                target=kafka_loop,
                args=(
                    stop,
                    args.kafka_brokers,
                    args.topic,
                    args.batch,
                    lambda_invoker(stream.handler, "fleetintel-stream"),
                ),
                daemon=True,
            )
        )
    for t in threads:
        t.start()
    server = ThreadingHTTPServer(
        ("0.0.0.0", args.port),  # noqa: S104 - listens inside the container network
        make_http_handler(lambda_invoker(api.handler, "fleetintel-api")),
    )

    def on_sigterm(*_: Any) -> None:
        stop.set()
        threading.Thread(target=server.shutdown).start()

    signal.signal(signal.SIGTERM, on_sigterm)
    log.info("API listening on :%d", args.port)
    with contextlib.suppress(KeyboardInterrupt):
        server.serve_forever()
    stop.set()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
