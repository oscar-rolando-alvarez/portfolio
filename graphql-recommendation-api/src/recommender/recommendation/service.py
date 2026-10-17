"""Application service orchestrating data loading, indexing, engines and caching."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import defaultdict
from collections.abc import Sequence

import numpy as np
import structlog
from prometheus_client import Histogram
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from recommender.cache import Cache
from recommender.config import Settings
from recommender.genai.embeddings import EmbeddingProvider
from recommender.genai.vectorstore import VectorStore
from recommender.models import Interaction, Item
from recommender.recommendation.base import (
    InteractionRecord,
    ItemRecord,
    Recommender,
    Scored,
    Snapshot,
    Strategy,
)
from recommender.recommendation.engines import (
    ContentRecommender,
    ItemCollaborativeRecommender,
    PopularityRecommender,
    SemanticRecommender,
)
from recommender.recommendation.hybrid import HybridRecommender

logger = structlog.get_logger(__name__)

RECOMMEND_LATENCY = Histogram(
    "recommendation_latency_seconds",
    "Latency of recommendation requests",
    labelnames=("strategy", "cache"),
)


class RecommendationService:
    """Keeps a fitted model set in memory and refits lazily after catalog/interaction changes."""

    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        embeddings: EmbeddingProvider,
        store: VectorStore,
        cache: Cache,
    ) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self.embeddings = embeddings
        self.store = store
        self._cache = cache
        self._lock = asyncio.Lock()
        self._version = 0
        self._fitted_version = -1
        self._snapshot = Snapshot(items=())
        self._engines: dict[Strategy, Recommender] = {}
        self._content: ContentRecommender | None = None
        self._collaborative: ItemCollaborativeRecommender | None = None

    # ------------------------------------------------------------------ indexing
    async def index_items(self, items: Sequence[Item]) -> None:
        """Embed items and upsert them into the vector store."""
        if not items:
            return
        vectors = await self.embeddings.embed([item.document() for item in items])
        await self.store.upsert([(item.id, v) for item, v in zip(items, vectors, strict=True)])

    async def reindex_all(self) -> int:
        async with self._session_factory() as session:
            items = list((await session.scalars(select(Item))).all())
        await self.index_items(items)
        self.invalidate()
        return len(items)

    def invalidate(self) -> None:
        """Mark models stale (new items or interactions); refit on next request."""
        self._version += 1

    # ------------------------------------------------------------------ fitting
    async def _ensure_fitted(self) -> None:
        if self._fitted_version == self._version:
            return
        async with self._lock:
            if self._fitted_version == self._version:
                return
            target = self._version
            started = time.perf_counter()
            async with self._session_factory() as session:
                items = (await session.scalars(select(Item).order_by(Item.created_at))).all()
                interactions = (await session.scalars(select(Interaction))).all()
            snapshot = Snapshot(
                items=[ItemRecord(i.id, i.document(), i.category) for i in items],
                interactions=[
                    InteractionRecord(x.user_id, x.item_id, x.strength) for x in interactions
                ],
            )
            fitted = await asyncio.to_thread(self._fit, snapshot)
            self._snapshot, self._engines = snapshot, fitted
            self._fitted_version = target
            logger.info(
                "recommender.fitted",
                items=len(snapshot.items),
                interactions=len(snapshot.interactions),
                ms=round((time.perf_counter() - started) * 1000, 1),
            )

    def _fit(self, snapshot: Snapshot) -> dict[Strategy, Recommender]:
        s = self._settings
        self._collaborative = ItemCollaborativeRecommender(snapshot)
        self._content = ContentRecommender(snapshot)
        popularity = PopularityRecommender(snapshot)
        semantic = SemanticRecommender(snapshot, self.store)
        engines: dict[Strategy, Recommender] = {
            Strategy.POPULARITY: popularity,
            Strategy.COLLABORATIVE: self._collaborative,
            Strategy.CONTENT: self._content,
            Strategy.SEMANTIC: semantic,
        }
        engines[Strategy.HYBRID] = HybridRecommender(
            {
                self._collaborative: s.weight_collaborative,
                self._content: s.weight_content,
                semantic: s.weight_semantic,
                popularity: s.weight_popularity,
            }
        )
        return engines

    # ------------------------------------------------------------------ queries
    async def recommend(
        self, user_id: uuid.UUID, strategy: Strategy = Strategy.HYBRID, limit: int = 10
    ) -> list[Scored]:
        started = time.perf_counter()
        await self._ensure_fitted()
        key = f"rec:v{self._fitted_version}:{user_id}:{strategy}:{limit}"
        cached = await self._cache.get(key)
        if cached is not None:
            RECOMMEND_LATENCY.labels(strategy.value, "hit").observe(time.perf_counter() - started)
            return [Scored(uuid.UUID(i), s, r) for i, s, r in json.loads(cached)]
        results = await self._engines[strategy].recommend(user_id, limit)
        await self._cache.set(
            key,
            json.dumps([(str(r.item_id), r.score, r.reason) for r in results]),
            self._settings.cache_ttl_seconds,
        )
        RECOMMEND_LATENCY.labels(strategy.value, "miss").observe(time.perf_counter() - started)
        return results

    async def similar_items(self, item_id: uuid.UUID, limit: int = 10) -> list[Scored]:
        """Blend of semantic (embedding), content (TF-IDF) and co-engagement similarity."""
        await self._ensure_fitted()
        if item_id not in self._snapshot.item_index:
            return []
        totals: dict[uuid.UUID, float] = defaultdict(float)
        vector = await self.store.get(item_id)
        if vector is not None:
            for hit_id, score in await self.store.search(vector, limit * 3, exclude=[item_id]):
                totals[hit_id] += 0.5 * max(score, 0.0)
        for weight, engine in ((0.3, self._content), (0.2, self._collaborative)):
            row = engine.similar(item_id) if engine else None
            if row is None or not row.any():
                continue
            peak = float(row.max()) or 1.0
            for idx in np.argsort(-row)[: limit * 3]:
                if row[idx] > 0:
                    totals[self._snapshot.items[int(idx)].id] += weight * float(row[idx]) / peak
        totals.pop(item_id, None)
        ranked = sorted(totals.items(), key=lambda kv: (-kv[1], str(kv[0])))[:limit]
        return [Scored(i, s, "Similar item") for i, s in ranked]

    async def semantic_search(self, query: str, limit: int = 10) -> list[Scored]:
        [vector] = await self.embeddings.embed([query])
        hits = await self.store.search(vector, limit)
        return [Scored(i, s, f"Matches '{query}'") for i, s in hits if s > 0]
