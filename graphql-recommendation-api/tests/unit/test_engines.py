from __future__ import annotations

import uuid

import pytest

from recommender.genai.embeddings import HashingEmbeddingProvider
from recommender.genai.vectorstore import InMemoryVectorStore
from recommender.recommendation.base import InteractionRecord, ItemRecord, Snapshot
from recommender.recommendation.engines import (
    ContentRecommender,
    ItemCollaborativeRecommender,
    PopularityRecommender,
    SemanticRecommender,
)
from recommender.recommendation.hybrid import HybridRecommender

A, B, C, D, E = (uuid.UUID(int=i) for i in range(1, 6))
U1, U2, U3 = (uuid.UUID(int=100 + i) for i in range(3))

ITEMS = [
    ItemRecord(A, "Python machine learning book about neural networks", "books"),
    ItemRecord(B, "Deep learning neural networks with Python", "books"),
    ItemRecord(C, "Trail running shoes for mountain trails", "sports"),
    ItemRecord(D, "Hiking backpack for mountain trails", "sports"),
    ItemRecord(E, "Mechanical keyboard for programmers", "electronics"),
]
INTERACTIONS = [
    InteractionRecord(U1, A, 5.0),
    InteractionRecord(U1, B, 4.0),
    InteractionRecord(U2, A, 5.0),
    InteractionRecord(U2, B, 5.0),
    InteractionRecord(U2, E, 2.0),
    InteractionRecord(U3, C, 4.0),
]
SNAPSHOT = Snapshot(items=ITEMS, interactions=INTERACTIONS)


def test_snapshot_matrix_and_history():
    assert SNAPSHOT.matrix.shape == (3, 5)
    assert SNAPSHOT.user_items(U1) == {A: 5.0, B: 4.0}
    assert SNAPSHOT.user_items(uuid.uuid4()) == {}


async def test_popularity_excludes_seen_items():
    recs = await PopularityRecommender(SNAPSHOT).recommend(U1, 3)

    assert [r.item_id for r in recs] == [C, E]  # A and B already seen; D has no interactions


async def test_collaborative_uses_co_engagement():
    recs = await ItemCollaborativeRecommender(SNAPSHOT).recommend(U1, 5)

    assert recs[0].item_id == E  # U2 liked A, B and E
    assert C not in {r.item_id for r in recs}
    assert await ItemCollaborativeRecommender(SNAPSHOT).recommend(uuid.uuid4(), 5) == []


async def test_content_recommends_textually_similar_items():
    recs = await ContentRecommender(SNAPSHOT).recommend(U3, 2)

    assert recs[0].item_id == D  # "mountain trails" overlaps with the running shoes


async def test_content_handles_empty_catalog():
    engine = ContentRecommender(Snapshot(items=()))

    assert engine.similar(A) is None
    assert await engine.recommend(U1, 3) == []


async def _semantic_engine() -> SemanticRecommender:
    provider = HashingEmbeddingProvider(128)
    store = InMemoryVectorStore()
    vectors = await provider.embed([i.document for i in ITEMS])
    await store.upsert([(i.id, v) for i, v in zip(ITEMS, vectors, strict=True)])
    return SemanticRecommender(SNAPSHOT, store)


async def test_semantic_profile_and_recommendations():
    engine = await _semantic_engine()

    recs = await engine.recommend(U3, 2)

    assert recs[0].item_id == D
    assert await engine.recommend(uuid.uuid4(), 2) == []


async def test_hybrid_blends_and_explains():
    engine = await _semantic_engine()
    hybrid = HybridRecommender(
        {
            ItemCollaborativeRecommender(SNAPSHOT): 0.5,
            engine: 0.3,
            PopularityRecommender(SNAPSHOT): 0.2,
            ContentRecommender(SNAPSHOT): 0.0,  # zero weight is ignored
        }
    )

    recs = await hybrid.recommend(U1, 3)

    ids = [r.item_id for r in recs]
    assert ids[0] == E
    assert A not in ids
    assert B not in ids
    assert all(r.reason for r in recs)
    assert recs == sorted(recs, key=lambda r: -r.score)


async def test_hybrid_cold_start_falls_back_to_popularity():
    hybrid = HybridRecommender(
        {ItemCollaborativeRecommender(SNAPSHOT): 0.8, PopularityRecommender(SNAPSHOT): 0.2}
    )

    recs = await hybrid.recommend(uuid.uuid4(), 2)

    assert [r.item_id for r in recs] == [A, B]
    assert recs[0].reason == "Popular with other users"


@pytest.mark.parametrize("limit", [0, 1])
async def test_limits_are_respected(limit: int):
    recs = await PopularityRecommender(SNAPSHOT).recommend(U3, limit)

    assert len(recs) == limit
