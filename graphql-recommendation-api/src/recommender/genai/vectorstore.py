"""Vector store port with an in-process NumPy adapter and an optional Qdrant adapter."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterable, Sequence
from typing import Any, Protocol, cast, runtime_checkable

import numpy as np

from recommender.config import Settings


@runtime_checkable
class VectorStore(Protocol):
    async def upsert(self, items: Sequence[tuple[uuid.UUID, Sequence[float]]]) -> None: ...

    async def search(
        self,
        vector: Sequence[float],
        limit: int,
        *,
        exclude: Iterable[uuid.UUID] = (),
    ) -> list[tuple[uuid.UUID, float]]: ...

    async def get(self, item_id: uuid.UUID) -> list[float] | None: ...

    async def count(self) -> int: ...


class InMemoryVectorStore:
    """Exact cosine search over normalized vectors. Fine for tens of thousands of items."""

    def __init__(self) -> None:
        self._ids: list[uuid.UUID] = []
        self._index: dict[uuid.UUID, int] = {}
        self._matrix = np.empty((0, 0), dtype=np.float64)

    async def upsert(self, items: Sequence[tuple[uuid.UUID, Sequence[float]]]) -> None:
        if not items:
            return
        new_rows = []
        for item_id, vector in items:
            row = np.asarray(vector, dtype=np.float64)
            if item_id in self._index:
                self._matrix[self._index[item_id]] = row
            else:
                self._index[item_id] = len(self._ids)
                self._ids.append(item_id)
                new_rows.append(row)
        if new_rows:
            stacked = np.vstack(new_rows)
            self._matrix = stacked if self._matrix.size == 0 else np.vstack([self._matrix, stacked])

    async def search(
        self,
        vector: Sequence[float],
        limit: int,
        *,
        exclude: Iterable[uuid.UUID] = (),
    ) -> list[tuple[uuid.UUID, float]]:
        if not self._ids or limit <= 0:
            return []
        scores = self._matrix @ np.asarray(vector, dtype=np.float64)
        excluded = set(exclude)
        order = np.argsort(-scores, kind="stable")
        results: list[tuple[uuid.UUID, float]] = []
        for idx in order:
            item_id = self._ids[int(idx)]
            if item_id in excluded:
                continue
            results.append((item_id, float(scores[idx])))
            if len(results) == limit:
                break
        return results

    async def get(self, item_id: uuid.UUID) -> list[float] | None:
        idx = self._index.get(item_id)
        return None if idx is None else [float(x) for x in self._matrix[idx]]

    async def count(self) -> int:
        return len(self._ids)


class QdrantVectorStore:
    """Adapter for Qdrant (`qdrant` extra). `location=":memory:"` runs embedded for tests."""

    def __init__(
        self,
        collection: str,
        dimensions: int,
        *,
        url: str | None = None,
        api_key: str | None = None,
        location: str | None = None,
    ) -> None:
        from qdrant_client import QdrantClient, models

        self._models = models
        self._collection = collection
        self._client = QdrantClient(url=url, api_key=api_key, location=location)
        if not self._client.collection_exists(collection):
            self._client.create_collection(
                collection,
                vectors_config=models.VectorParams(
                    size=dimensions, distance=models.Distance.COSINE
                ),
            )

    async def upsert(self, items: Sequence[tuple[uuid.UUID, Sequence[float]]]) -> None:
        if not items:
            return
        points = [
            self._models.PointStruct(id=str(item_id), vector=list(vector))
            for item_id, vector in items
        ]
        await asyncio.to_thread(self._client.upsert, self._collection, points=points)

    async def search(
        self,
        vector: Sequence[float],
        limit: int,
        *,
        exclude: Iterable[uuid.UUID] = (),
    ) -> list[tuple[uuid.UUID, float]]:
        excluded = [str(x) for x in exclude]
        query_filter: Any = None
        if excluded:
            query_filter = self._models.Filter(
                must_not=[self._models.HasIdCondition(has_id=excluded)]
            )
        response = await asyncio.to_thread(
            self._client.query_points,
            self._collection,
            query=list(vector),
            limit=limit,
            query_filter=query_filter,
        )
        return [(uuid.UUID(str(p.id)), float(p.score)) for p in response.points]

    async def get(self, item_id: uuid.UUID) -> list[float] | None:
        points = await asyncio.to_thread(
            self._client.retrieve, self._collection, ids=[str(item_id)], with_vectors=True
        )
        if not points:
            return None
        vector = cast(list[float], points[0].vector)
        return [float(x) for x in vector]

    async def count(self) -> int:
        result = await asyncio.to_thread(self._client.count, self._collection)
        return int(result.count)


def build_vector_store(settings: Settings) -> VectorStore:
    if settings.vector_store == "qdrant":
        return QdrantVectorStore(
            settings.qdrant_collection,
            settings.embedding_dimensions,
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key.get_secret_value() if settings.qdrant_api_key else None,
            location=None if settings.qdrant_url else ":memory:",
        )
    return InMemoryVectorStore()
