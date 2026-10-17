"""SQS job queue adapter."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from mypy_boto3_sqs.client import SQSClient


class SqsJobQueue:
    def __init__(self, client: SQSClient, queue_url: str) -> None:
        self.c = client
        self.url = queue_url

    def publish(self, messages: list[dict[str, Any]]) -> None:
        for i in range(0, len(messages), 10):
            chunk = messages[i : i + 10]
            resp = self.c.send_message_batch(
                QueueUrl=self.url,
                Entries=[
                    {"Id": str(n), "MessageBody": json.dumps(m, separators=(",", ":"), default=str)}
                    for n, m in enumerate(chunk)
                ],
            )
            failed = resp.get("Failed", [])
            if failed:
                raise RuntimeError(
                    f"SQS rejected {len(failed)} messages: {failed[0].get('Message')}"
                )


class NullQueue:
    """Used when a queue is optional (e.g. no quarantine queue configured)."""

    def publish(self, messages: list[dict[str, Any]]) -> None:
        return None
