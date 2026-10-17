from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest
from pydantic import SecretStr

from recommender.config import Settings
from recommender.genai.embeddings import (
    EmbeddingError,
    EmbeddingProvider,
    HashingEmbeddingProvider,
    OpenAICompatibleEmbeddingProvider,
    build_embedding_provider,
)
from recommender.genai.vectorstore import (
    InMemoryVectorStore,
    QdrantVectorStore,
    VectorStore,
    build_vector_store,
)


async def test_hashing_embeddings_are_deterministic_normalized_and_semantic():
    provider = HashingEmbeddingProvider(256)
    a, b, c = await provider.embed(
        ["machine learning with python", "python machine learning", "trail running shoes"]
    )

    assert a == (await provider.embed(["machine learning with python"]))[0]
    assert np.linalg.norm(a) == pytest.approx(1.0)
    assert np.dot(a, b) > np.dot(a, c)
    assert await provider.embed([]) == []
    assert isinstance(provider, EmbeddingProvider)
    assert provider.name == "hashing-256"


class _StubEmbeddings:
    def __init__(self, dims: int, fail: bool = False, shape_error: bool = False) -> None:
        self.dims, self.fail, self.shape_error = dims, fail, shape_error
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.fail:
            raise TimeoutError("boom")
        dims = self.dims - 1 if self.shape_error else self.dims
        data = [
            SimpleNamespace(index=i, embedding=[float(i + 1)] * dims)
            for i in reversed(range(len(kwargs["input"])))
        ]
        return SimpleNamespace(data=data)


async def test_openai_provider_batches_orders_and_normalizes():
    stub = _StubEmbeddings(dims=4)
    provider = OpenAICompatibleEmbeddingProvider(
        SimpleNamespace(embeddings=stub), model="emb-model", dimensions=4, batch_size=2
    )

    vectors = await provider.embed(["a", "b", "c"])

    assert len(stub.calls) == 2
    assert stub.calls[0]["model"] == "emb-model"
    assert stub.calls[0]["dimensions"] == 4
    assert all(np.linalg.norm(v) == pytest.approx(1.0) for v in vectors)
    assert provider.name == "emb-model"
    assert provider.dimensions == 4

    plain = _StubEmbeddings(dims=4)
    await OpenAICompatibleEmbeddingProvider(
        SimpleNamespace(embeddings=plain), model="m", dimensions=4, send_dimensions=False
    ).embed(["a"])
    assert "dimensions" not in plain.calls[0]


@pytest.mark.parametrize(
    "stub", [_StubEmbeddings(4, fail=True), _StubEmbeddings(4, shape_error=True)]
)
async def test_openai_provider_errors(stub: _StubEmbeddings):
    provider = OpenAICompatibleEmbeddingProvider(
        SimpleNamespace(embeddings=stub), model="m", dimensions=4
    )

    with pytest.raises(EmbeddingError):
        await provider.embed(["x"])


def test_provider_factory():
    assert isinstance(build_embedding_provider(Settings()), HashingEmbeddingProvider)
    real = build_embedding_provider(
        Settings(
            embedding_provider="openai",
            llm_base_url="http://localhost:11434/v1",
            llm_api_key=SecretStr("x"),
            embedding_model="nomic-embed-text",
        )
    )
    assert isinstance(real, OpenAICompatibleEmbeddingProvider)
    assert real.name == "nomic-embed-text"


@pytest.fixture(params=["memory", "qdrant"])
def store(request: pytest.FixtureRequest) -> VectorStore:
    if request.param == "memory":
        return InMemoryVectorStore()
    pytest.importorskip("qdrant_client")
    return QdrantVectorStore("test", dimensions=3, location=":memory:")


async def test_vector_store_contract(store: VectorStore):
    a, b, c = (uuid.UUID(int=i) for i in range(1, 4))
    assert await store.search([1.0, 0.0, 0.0], 3) == []

    await store.upsert([(a, [1.0, 0.0, 0.0]), (b, [0.0, 1.0, 0.0]), (c, [0.6, 0.8, 0.0])])
    await store.upsert([(b, [0.0, 0.0, 1.0])])  # update in place
    await store.upsert([])

    assert await store.count() == 3
    hits = await store.search([1.0, 0.0, 0.0], 2)
    assert [h[0] for h in hits] == [a, c]
    assert hits[0][1] == pytest.approx(1.0, abs=1e-5)
    assert next(h[0] for h in await store.search([1.0, 0.0, 0.0], 5, exclude=[a])) == c
    assert await store.get(b) == pytest.approx([0.0, 0.0, 1.0])
    assert await store.get(uuid.uuid4()) is None


def test_vector_store_factory():
    assert isinstance(build_vector_store(Settings()), InMemoryVectorStore)
    pytest.importorskip("qdrant_client")
    assert isinstance(build_vector_store(Settings(vector_store="qdrant")), QdrantVectorStore)
