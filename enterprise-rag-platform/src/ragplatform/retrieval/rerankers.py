"""Reranker adapters. All return candidates sorted by ``rerank_score`` in 0..1."""

from __future__ import annotations

import itertools
import json
import re
from typing import Any

import httpx

from ragplatform.domain.errors import ProviderError
from ragplatform.domain.models import Candidate
from ragplatform.domain.ports import LLMProvider
from ragplatform.domain.text import content_terms
from ragplatform.generation.prompts import build_rerank_messages


def _sorted(candidates: list[Candidate]) -> list[Candidate]:
    return sorted(candidates, key=lambda c: (-(c.rerank_score or 0.0), -c.fused_score))


class NoopReranker:
    name = "none"

    async def rerank(self, query: str, candidates: list[Candidate]) -> list[Candidate]:
        for c in candidates:
            c.rerank_score = c.fused_score
        return candidates


class LexicalReranker:
    """Deterministic cross-encoder stand-in: query-term coverage over title, section and
    body, a bigram (phrase) bonus and a small prior from the fused retrieval score."""

    name = "lexical"

    async def rerank(self, query: str, candidates: list[Candidate]) -> list[Candidate]:
        q_terms = content_terms(query)
        q_set = set(q_terms)
        q_bigrams = set(itertools.pairwise(q_terms))
        for c in candidates:
            doc_terms = content_terms(" ".join([c.document_title, *c.section_path, c.content]))
            d_set = set(doc_terms)
            coverage = len(q_set & d_set) / len(q_set) if q_set else 0.0
            bigrams = set(itertools.pairwise(doc_terms))
            phrase = len(q_bigrams & bigrams) / len(q_bigrams) if q_bigrams else 0.0
            c.rerank_score = round(0.7 * coverage + 0.15 * phrase + 0.15 * c.fused_score, 4)
        return _sorted(candidates)


class HttpCrossEncoderReranker:
    """Calls a self-hosted cross-encoder ``/rerank`` endpoint (e.g. Hugging Face TEI,
    Infinity or vLLM). Accepts both ``[{index, score}]`` and ``{results: [{index,
    relevance_score}]}`` response shapes; scores are min-max normalised to 0..1."""

    name = "http-cross-encoder"

    def __init__(
        self,
        url: str,
        *,
        api_key: str | None = None,
        model: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = client or httpx.AsyncClient(headers=headers, timeout=30.0)
        self._url = url
        self._model = model

    async def rerank(self, query: str, candidates: list[Candidate]) -> list[Candidate]:
        if not candidates:
            return candidates
        texts = [c.content for c in candidates]
        payload: dict[str, Any] = {"query": query, "texts": texts, "documents": texts}
        if self._model:
            payload["model"] = self._model
        try:
            resp = await self._client.post(self._url, json=payload)
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError(f"reranker failed: {exc}") from exc
        rows = data["results"] if isinstance(data, dict) else data
        raw = {int(r["index"]): float(r.get("relevance_score", r.get("score", 0.0))) for r in rows}
        lo, hi = min(raw.values(), default=0.0), max(raw.values(), default=1.0)
        calibrated = lo >= 0.0 and hi <= 1.0  # already probabilities (sigmoid outputs)
        span = (hi - lo) or 1.0
        for i, c in enumerate(candidates):
            score = raw.get(i, lo)
            c.rerank_score = score if calibrated else (score - lo) / span
        return _sorted(candidates)


class LLMReranker:
    """Listwise LLM reranking; useful when no cross-encoder is deployed."""

    name = "llm"

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    async def rerank(self, query: str, candidates: list[Candidate]) -> list[Candidate]:
        if not candidates:
            return candidates
        out = await self._llm.complete(
            build_rerank_messages(query, candidates), max_tokens=400, temperature=0.0
        )
        match = re.search(r"\{.*\}", out.text, re.DOTALL)
        scores: dict[str, float] = {}
        if match:
            try:
                scores = {str(k): float(v) for k, v in json.loads(match.group(0)).items()}
            except (ValueError, AttributeError):
                scores = {}
        for c in candidates:
            c.rerank_score = max(0.0, min(1.0, scores.get(str(c.chunk_id), 0.0) / 10.0))
        return _sorted(candidates)
