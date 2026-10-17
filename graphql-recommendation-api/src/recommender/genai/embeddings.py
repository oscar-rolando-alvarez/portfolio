"""Provider-agnostic text embeddings.

* `HashingEmbeddingProvider` - deterministic, dependency-free fake (feature hashing of word
  unigrams and bigrams, L2-normalized). Used by default and in tests: similar texts get similar
  vectors, so semantic features remain demonstrable offline.
* `OpenAICompatibleEmbeddingProvider` - any OpenAI-compatible `/embeddings` endpoint
  (OpenAI, Azure OpenAI, Ollama, vLLM, LM Studio, a LiteLLM proxy, ...).
"""

from __future__ import annotations

import hashlib
import itertools
import re
from collections.abc import Sequence
from typing import TYPE_CHECKING, Protocol, runtime_checkable

import numpy as np
import structlog

from recommender.config import Settings

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = structlog.get_logger(__name__)

Vector = list[float]
_TOKEN = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset(
    "a an and are as at be by for from in into is it of on or the to with your you".split()  # noqa: SIM905
)


class EmbeddingError(RuntimeError):
    """The embedding provider failed or returned an invalid response."""


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Port: maps texts to fixed-size, L2-normalized vectors."""

    @property
    def dimensions(self) -> int: ...

    @property
    def name(self) -> str: ...

    async def embed(self, texts: Sequence[str]) -> list[Vector]: ...


def _stem(token: str) -> str:
    """Very light plural folding so 'trails' and 'trail' share a feature."""
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _normalize(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized: np.ndarray = matrix / norms
    return normalized


class HashingEmbeddingProvider:
    """Deterministic feature-hashing embeddings (offline fake)."""

    def __init__(self, dimensions: int = 256) -> None:
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    @property
    def name(self) -> str:
        return f"hashing-{self._dimensions}"

    def _vector(self, text: str) -> np.ndarray:
        tokens = [_stem(t) for t in _TOKEN.findall(text.lower()) if t not in _STOPWORDS]
        features = tokens + [f"{a}_{b}" for a, b in itertools.pairwise(tokens)]
        vec = np.zeros(self._dimensions, dtype=np.float64)
        for feature in features:
            digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
            bucket = int.from_bytes(digest[:4], "little") % self._dimensions
            sign = 1.0 if digest[4] & 1 else -1.0
            vec[bucket] += sign
        return vec

    async def embed(self, texts: Sequence[str]) -> list[Vector]:
        if not texts:
            return []
        matrix = _normalize(np.vstack([self._vector(t) for t in texts]))
        return [row.tolist() for row in matrix]


class OpenAICompatibleEmbeddingProvider:
    """Embeddings from any OpenAI-compatible API, batched and normalized."""

    def __init__(
        self,
        client: AsyncOpenAI,
        model: str,
        dimensions: int,
        *,
        batch_size: int = 64,
        send_dimensions: bool = True,
    ) -> None:
        self._client = client
        self._send_dimensions = send_dimensions
        self._model = model
        self._dimensions = dimensions
        self._batch_size = batch_size

    @property
    def dimensions(self) -> int:
        return self._dimensions

    @property
    def name(self) -> str:
        return self._model

    async def embed(self, texts: Sequence[str]) -> list[Vector]:
        vectors: list[Vector] = []
        for start in range(0, len(texts), self._batch_size):
            batch = list(texts[start : start + self._batch_size])
            try:
                if self._send_dimensions:
                    response = await self._client.embeddings.create(
                        model=self._model, input=batch, dimensions=self._dimensions
                    )
                else:
                    response = await self._client.embeddings.create(model=self._model, input=batch)
            except Exception as exc:
                logger.warning("embeddings.failed", error=type(exc).__name__, batch=len(batch))
                raise EmbeddingError("Embedding provider request failed") from exc
            rows = sorted(response.data, key=lambda d: d.index)
            if len(rows) != len(batch) or any(len(r.embedding) != self._dimensions for r in rows):
                raise EmbeddingError("Embedding provider returned an unexpected shape")
            matrix = _normalize(np.asarray([r.embedding for r in rows], dtype=np.float64))
            vectors.extend(row.tolist() for row in matrix)
        return vectors


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_provider == "openai":
        from openai import AsyncOpenAI

        api_key = settings.llm_api_key.get_secret_value() if settings.llm_api_key else None
        client = AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=api_key or "not-needed",
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )
        return OpenAICompatibleEmbeddingProvider(
            client,
            model=settings.embedding_model,
            dimensions=settings.embedding_dimensions,
            send_dimensions=settings.embedding_send_dimensions,
        )
    return HashingEmbeddingProvider(settings.embedding_dimensions)
