"""In-memory Powertools idempotency persistence layer (tests, evals, memory backend)."""

from __future__ import annotations

import threading

from aws_lambda_powertools.utilities.idempotency import BasePersistenceLayer
from aws_lambda_powertools.utilities.idempotency.exceptions import (
    IdempotencyItemAlreadyExistsError,
    IdempotencyItemNotFoundError,
)
from aws_lambda_powertools.utilities.idempotency.persistence.datarecord import DataRecord


class InMemoryPersistenceLayer(BasePersistenceLayer):
    def __init__(self) -> None:
        super().__init__()  # type: ignore[no-untyped-call]
        self._records: dict[str, DataRecord] = {}
        self._lock = threading.Lock()

    def _get_record(self, idempotency_key: str) -> DataRecord:
        with self._lock:
            try:
                return self._records[idempotency_key]
            except KeyError as exc:
                raise IdempotencyItemNotFoundError from exc

    def _put_record(self, data_record: DataRecord) -> None:
        with self._lock:
            old = self._records.get(data_record.idempotency_key)
            if old is not None and not old.is_expired:
                raise IdempotencyItemAlreadyExistsError(old_data_record=old)
            self._records[data_record.idempotency_key] = data_record

    def _update_record(self, data_record: DataRecord) -> None:
        with self._lock:
            self._records[data_record.idempotency_key] = data_record

    def _delete_record(self, data_record: DataRecord) -> None:
        with self._lock:
            self._records.pop(data_record.idempotency_key, None)
