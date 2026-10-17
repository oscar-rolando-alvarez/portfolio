"""Retrieval use case: rewrite -> embed -> hybrid (lexical + ANN, ACL-filtered in SQL)
-> RRF -> rerank -> injection guard -> top-k."""

from __future__ import annotations

import time
from collections.abc import Sequence
from dataclasses import dataclass, field

from opentelemetry.trace import SpanKind

from ragplatform.config import InjectionPolicy, Settings
from ragplatform.domain.models import Candidate, Principal, TokenUsage
from ragplatform.domain.ports import (
    ChatMessage,
    EmbeddingProvider,
    QueryRewriter,
    Reranker,
    SearchIndex,
)
from ragplatform.generation.guardrails import InjectionDetector
from ragplatform.observability.cost import CostMeter
from ragplatform.observability.telemetry import genai_span_attributes, record_model_call, tracer
from ragplatform.retrieval.fusion import reciprocal_rank_fusion


@dataclass(slots=True)
class PreparedQuery:
    original: str
    rewritten: str
    vector: list[float]
    usage: TokenUsage = field(default_factory=TokenUsage)


@dataclass(slots=True)
class RetrievalResult:
    candidates: list[Candidate]
    total_candidates: int
    dropped_for_injection: int


class RetrievalService:
    def __init__(
        self,
        settings: Settings,
        index: SearchIndex,
        embedder: EmbeddingProvider,
        reranker: Reranker,
        rewriter: QueryRewriter,
        cost: CostMeter,
        injection: InjectionDetector | None = None,
    ) -> None:
        self._s = settings
        self._index = index
        self._embedder = embedder
        self._reranker = reranker
        self._rewriter = rewriter
        self._cost = cost
        self._injection = injection or InjectionDetector()

    async def prepare(
        self, principal: Principal, query: str, history: Sequence[ChatMessage] = ()
    ) -> PreparedQuery:
        with tracer.start_as_current_span("rag.rewrite") as span:
            rewritten = await self._rewriter.rewrite(query, history)
            span.set_attribute("rag.query.rewritten", rewritten != query)
        model = self._embedder.model
        with tracer.start_as_current_span(
            f"embeddings {model}",
            kind=SpanKind.CLIENT,
            attributes=genai_span_attributes("embeddings", self._embedder.provider_name, model),
        ) as span:
            started = time.perf_counter()
            result = await self._embedder.embed([rewritten])
            elapsed = time.perf_counter() - started
            usage = await self._cost.charge(
                tenant_id=principal.tenant_id,
                subject=principal.subject,
                operation="query.embed",
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=0,
                latency_ms=elapsed * 1000,
            )
            record_model_call(
                span=span,
                operation="embeddings",
                provider=self._embedder.provider_name,
                model=model,
                input_tokens=result.input_tokens,
                output_tokens=0,
                duration_s=elapsed,
                cost_usd=usage.cost_usd,
                tenant_id=principal.tenant_id,
            )
        return PreparedQuery(query, rewritten, result.vectors[0], usage)

    async def search(
        self, principal: Principal, prepared: PreparedQuery, *, top_k: int | None = None
    ) -> RetrievalResult:
        k = top_k or self._s.retrieval_top_k
        with tracer.start_as_current_span("rag.retrieve") as span:
            span.set_attribute("rag.tenant_id", principal.tenant_id)
            span.set_attribute("rag.retrieval.candidates_requested", self._s.retrieval_candidates)
            raw = await self._index.hybrid_candidates(
                principal, prepared.rewritten, prepared.vector, limit=self._s.retrieval_candidates
            )
            fused = reciprocal_rank_fusion(raw, k=self._s.rrf_k)
            span.set_attribute("rag.retrieval.candidates", len(fused))
            span.set_attribute(
                "rag.retrieval.lexical_hits", sum(1 for c in fused if c.lexical_rank is not None)
            )
            span.set_attribute(
                "rag.retrieval.vector_hits", sum(1 for c in fused if c.vector_rank is not None)
            )
        pool = fused[: max(k * 4, 20)]
        with tracer.start_as_current_span("rag.rerank") as span:
            span.set_attribute("rag.reranker", self._reranker.name)
            span.set_attribute("rag.rerank.input", len(pool))
            started = time.perf_counter()
            ranked = await self._reranker.rerank(prepared.rewritten, pool)
            span.set_attribute("rag.rerank.latency_ms", (time.perf_counter() - started) * 1000)
            if ranked:
                span.set_attribute("rag.rerank.top_score", ranked[0].relevance)
        kept, dropped = self._guard(ranked)
        return RetrievalResult(kept[:k], len(fused), dropped)

    def _guard(self, candidates: list[Candidate]) -> tuple[list[Candidate], int]:
        kept: list[Candidate] = []
        dropped = 0
        for c in candidates:
            verdict = self._injection.assess(c.content)
            score = max(verdict.score, c.injection_score)
            if score >= self._s.injection_threshold:
                if self._s.injection_policy == InjectionPolicy.DROP:
                    dropped += 1
                    continue
                c.metadata["injection_flagged"] = True
            kept.append(c)
        return kept, dropped
