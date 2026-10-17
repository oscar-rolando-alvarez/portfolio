"""Ingestion worker: claims jobs from the Postgres queue (``FOR UPDATE SKIP LOCKED``), so
any number of replicas can run concurrently without a separate broker."""

from __future__ import annotations

import asyncio
import contextlib
import random
import signal
from datetime import timedelta

import structlog

from ragplatform.domain.errors import NotFoundError, ParseError, UnsupportedDocumentError
from ragplatform.domain.models import utcnow
from ragplatform.domain.ports import JobQueue
from ragplatform.ingestion.service import IngestionService

log = structlog.get_logger(__name__)

#: errors that will never succeed on retry
PERMANENT_ERRORS = (ParseError, UnsupportedDocumentError, NotFoundError)


class IngestionWorker:
    def __init__(
        self,
        queue: JobQueue,
        ingestion: IngestionService,
        *,
        max_attempts: int = 5,
        poll_interval_s: float = 1.0,
    ) -> None:
        self._queue = queue
        self._ingestion = ingestion
        self._max_attempts = max_attempts
        self._poll = poll_interval_s
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def run_once(self) -> bool:
        """Process at most one job. Returns True if a job was claimed."""
        job = await self._queue.claim()
        if job is None:
            return False
        bound = log.bind(job_id=str(job.id), document_id=str(job.document_id), tenant=job.tenant_id)
        try:
            chunks = await self._ingestion.process(job.tenant_id, job.document_id)
        except PERMANENT_ERRORS as exc:
            bound.warning("job.failed_permanently", error=str(exc))
            await self._queue.fail(job.id, str(exc), retry_at=None)
        except Exception as exc:
            if job.attempts >= self._max_attempts:
                bound.error("job.exhausted", error=str(exc), attempts=job.attempts)
                await self._queue.fail(job.id, str(exc), retry_at=None)
            else:
                delay = min(300.0, 2**job.attempts) + random.uniform(0, 1)  # noqa: S311
                bound.warning("job.retry", error=str(exc), attempts=job.attempts, delay_s=delay)
                await self._queue.fail(
                    job.id, str(exc), retry_at=utcnow() + timedelta(seconds=delay)
                )
        else:
            await self._queue.complete(job.id)
            bound.info("job.succeeded", chunks=chunks)
        return True

    async def drain(self, max_jobs: int = 10_000) -> int:
        processed = 0
        while processed < max_jobs and await self.run_once():
            processed += 1
        return processed

    async def run_forever(self) -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self.stop)
        log.info("worker.started")
        while not self._stop.is_set():
            claimed = await self.run_once()
            if not claimed:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self._stop.wait(), timeout=self._poll)
        log.info("worker.stopped")
