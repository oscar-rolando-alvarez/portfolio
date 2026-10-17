"""Answer use case: guarded, grounded generation with citations, refusal, streaming and a
per-tenant/per-ACL semantic cache."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator, Sequence
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import structlog
from opentelemetry import trace
from opentelemetry.trace import SpanKind

from ragplatform.config import Settings
from ragplatform.domain.models import (
    Answer,
    Candidate,
    Citation,
    Principal,
    RefusalReason,
    TokenUsage,
)
from ragplatform.domain.ports import (
    ChatMessage,
    DocumentStore,
    LLMProvider,
    SemanticCache,
)
from ragplatform.domain.text import estimate_tokens
from ragplatform.generation.citations import validate_citations
from ragplatform.generation.guardrails import InjectionDetector
from ragplatform.generation.prompts import (
    INSUFFICIENT_EVIDENCE,
    PROMPT_VERSION,
    build_answer_messages,
)
from ragplatform.observability.cost import CostMeter
from ragplatform.observability.telemetry import (
    cache_counter,
    genai_span_attributes,
    record_model_call,
    refusal_counter,
    tracer,
)
from ragplatform.retrieval.service import PreparedQuery, RetrievalService

log = structlog.get_logger(__name__)

REFUSAL_TEXT = (
    "I could not find enough information in the documents you have access to "
    "to answer that reliably."
)


@dataclass(slots=True)
class _Plan:
    """Outcome of the pre-generation phase shared by sync and streaming paths."""

    prepared: PreparedQuery
    corpus_version: int
    context: list[Candidate]
    guardrails: dict[str, Any]
    early: Answer | None = None


class AnswerService:
    def __init__(
        self,
        settings: Settings,
        retrieval: RetrievalService,
        llm: LLMProvider,
        store: DocumentStore,
        cache: SemanticCache,
        cost: CostMeter,
        injection: InjectionDetector | None = None,
    ) -> None:
        self._s = settings
        self._retrieval = retrieval
        self._llm = llm
        self._store = store
        self._cache = cache
        self._cost = cost
        self._injection = injection or InjectionDetector()

    # ------------------------------------------------------------------ public API
    async def answer(
        self,
        principal: Principal,
        question: str,
        history: Sequence[ChatMessage] = (),
        *,
        top_k: int | None = None,
        use_cache: bool = True,
    ) -> Answer:
        with tracer.start_as_current_span(
            "rag.query", attributes=self._root_attrs(principal)
        ) as root:
            plan = await self._plan(principal, question, history, top_k, use_cache)
            if plan.early is not None:
                self._finish_span(root, plan.early)
                return plan.early
            messages = build_answer_messages(plan.prepared.rewritten, plan.context)
            started = time.perf_counter()
            with self._chat_span() as span:
                completion = await self._llm.complete(
                    messages,
                    max_tokens=self._s.llm_max_output_tokens,
                    temperature=self._s.llm_temperature,
                )
                usage = await self._charge(
                    principal,
                    span,
                    completion.model,
                    completion.input_tokens,
                    completion.output_tokens,
                    time.perf_counter() - started,
                )
            usage.add(plan.prepared.usage)
            answer = self._finalize(completion.text, plan, usage)
            await self._maybe_cache(principal, plan, answer, use_cache)
            self._finish_span(root, answer)
            return answer

    async def stream(
        self,
        principal: Principal,
        question: str,
        history: Sequence[ChatMessage] = (),
        *,
        top_k: int | None = None,
        use_cache: bool = True,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yields SSE-ready events: ``meta`` -> ``token``* -> ``done`` (validated answer)."""
        with tracer.start_as_current_span(
            "rag.query", attributes=self._root_attrs(principal)
        ) as root:
            root.set_attribute("rag.stream", True)
            plan = await self._plan(principal, question, history, top_k, use_cache)
            yield {
                "event": "meta",
                "data": {
                    "rewritten_query": plan.prepared.rewritten,
                    "sources": [self._source_dict(c) for c in plan.context],
                    "prompt_version": PROMPT_VERSION,
                },
            }
            if plan.early is not None:
                if not plan.early.refused:
                    yield {"event": "token", "data": {"text": plan.early.text}}
                self._finish_span(root, plan.early)
                yield {"event": "done", "data": answer_to_dict(plan.early)}
                return
            messages = build_answer_messages(plan.prepared.rewritten, plan.context)
            parts: list[str] = []
            started = time.perf_counter()
            first_token_at: float | None = None
            released = False
            usage = TokenUsage()
            with self._chat_span() as span:
                async for delta in self._llm.stream(
                    messages,
                    max_tokens=self._s.llm_max_output_tokens,
                    temperature=self._s.llm_temperature,
                ):
                    if delta.done:
                        usage = await self._charge(
                            principal,
                            span,
                            delta.model or self._llm.model,
                            delta.input_tokens,
                            delta.output_tokens,
                            time.perf_counter() - started,
                        )
                        break
                    if first_token_at is None:
                        first_token_at = time.perf_counter()
                        span.set_attribute("rag.ttft_ms", (first_token_at - started) * 1000)
                    parts.append(delta.text)
                    if released:
                        yield {"event": "token", "data": {"text": delta.text}}
                        continue
                    # hold tokens back while the output could still be the refusal sentinel
                    if INSUFFICIENT_EVIDENCE.startswith("".join(parts).strip()):
                        continue
                    released = True
                    yield {"event": "token", "data": {"text": "".join(parts)}}
                else:
                    text = "".join(parts)
                    usage = await self._charge(
                        principal,
                        span,
                        self._llm.model,
                        estimate_tokens(str(messages)),
                        estimate_tokens(text),
                        time.perf_counter() - started,
                    )
            usage.add(plan.prepared.usage)
            answer = self._finalize("".join(parts), plan, usage)
            await self._maybe_cache(principal, plan, answer, use_cache)
            self._finish_span(root, answer)
            yield {"event": "done", "data": answer_to_dict(answer)}

    # ------------------------------------------------------------------ internals
    async def _plan(
        self,
        principal: Principal,
        question: str,
        history: Sequence[ChatMessage],
        top_k: int | None,
        use_cache: bool,
    ) -> _Plan:
        guardrails: dict[str, Any] = {}
        prepared = await self._retrieval.prepare(principal, question, history)
        verdict = self._injection.assess(question)
        if verdict.signals:
            guardrails["query_injection_signals"] = verdict.signals
        if verdict.score >= max(self._s.injection_threshold, 0.6):
            return _Plan(
                prepared,
                0,
                [],
                guardrails,
                self._refusal(prepared, RefusalReason.UNSAFE_QUERY, guardrails),
            )

        corpus_version = await self._store.corpus_version(principal.tenant_id)
        if use_cache and self._s.cache_enabled:
            hit = await self._cache.lookup(
                principal, corpus_version, prepared.vector, min_similarity=self._s.cache_similarity
            )
            cache_counter.add(1, {"rag.cache.hit": hit is not None})
            if hit is not None:
                cached = answer_from_dict(hit.payload)
                cached.cached = True
                cached.usage = prepared.usage
                cached.guardrails = {**guardrails, "cache_similarity": round(hit.similarity, 4)}
                return _Plan(prepared, corpus_version, [], guardrails, cached)

        result = await self._retrieval.search(principal, prepared, top_k=top_k)
        guardrails["dropped_for_injection"] = result.dropped_for_injection
        guardrails["flagged_sources"] = sum(
            1 for c in result.candidates if c.metadata.get("injection_flagged")
        )
        if not result.candidates:
            return _Plan(
                prepared,
                corpus_version,
                [],
                guardrails,
                self._refusal(prepared, RefusalReason.NO_EVIDENCE, guardrails),
            )
        top = result.candidates[0].relevance
        guardrails["top_relevance"] = round(top, 4)
        if top < self._s.min_relevance:
            return _Plan(
                prepared,
                corpus_version,
                result.candidates,
                guardrails,
                self._refusal(prepared, RefusalReason.LOW_RELEVANCE, guardrails, result.candidates),
            )
        context = self._fit_context(result.candidates)
        return _Plan(prepared, corpus_version, context, guardrails)

    def _fit_context(self, candidates: list[Candidate]) -> list[Candidate]:
        budget = self._s.max_context_tokens
        picked: list[Candidate] = []
        for c in candidates:
            n = estimate_tokens(c.content)
            if picked and n > budget:
                break
            picked.append(c)
            budget -= n
        return picked

    def _finalize(self, raw_text: str, plan: _Plan, usage: TokenUsage) -> Answer:
        text = raw_text.strip()
        if not text or INSUFFICIENT_EVIDENCE in text[: len(INSUFFICIENT_EVIDENCE) + 8]:
            return self._refusal(
                plan.prepared, RefusalReason.MODEL_DECLINED, plan.guardrails, plan.context, usage
            )
        check = validate_citations(text, plan.context)
        plan.guardrails["invalid_citations"] = len(check.invalid_ids)
        if not check.citations:
            return self._refusal(
                plan.prepared, RefusalReason.UNGROUNDED, plan.guardrails, plan.context, usage
            )
        return Answer(
            text=check.text,
            citations=check.citations,
            refused=False,
            refusal_reason=None,
            rewritten_query=plan.prepared.rewritten,
            usage=usage,
            guardrails=plan.guardrails,
            retrieved=plan.context,
        )

    def _refusal(
        self,
        prepared: PreparedQuery,
        reason: RefusalReason,
        guardrails: dict[str, Any],
        retrieved: list[Candidate] | None = None,
        usage: TokenUsage | None = None,
    ) -> Answer:
        refusal_counter.add(1, {"rag.refusal.reason": reason.value})
        return Answer(
            text=REFUSAL_TEXT,
            citations=[],
            refused=True,
            refusal_reason=reason,
            rewritten_query=prepared.rewritten,
            usage=usage or prepared.usage,
            guardrails=guardrails,
            retrieved=retrieved or [],
        )

    async def _maybe_cache(
        self, principal: Principal, plan: _Plan, answer: Answer, use_cache: bool
    ) -> None:
        if answer.refused or not use_cache or not self._s.cache_enabled:
            return
        await self._cache.store(
            principal,
            plan.corpus_version,
            plan.prepared.rewritten,
            plan.prepared.vector,
            answer_to_dict(answer),
            ttl_s=self._s.cache_ttl_s,
        )

    def _chat_span(self) -> AbstractContextManager[trace.Span]:
        model = self._llm.model
        attrs = genai_span_attributes("chat", self._llm.provider_name, model)
        attrs["gen_ai.request.max_tokens"] = self._s.llm_max_output_tokens
        attrs["gen_ai.request.temperature"] = self._s.llm_temperature
        attrs["rag.prompt_version"] = PROMPT_VERSION
        return tracer.start_as_current_span(f"chat {model}", kind=SpanKind.CLIENT, attributes=attrs)

    async def _charge(
        self,
        principal: Principal,
        span: trace.Span,
        model: str,
        input_tokens: int,
        output_tokens: int,
        elapsed_s: float,
    ) -> TokenUsage:
        usage = await self._cost.charge(
            tenant_id=principal.tenant_id,
            subject=principal.subject,
            operation="query.generate",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=elapsed_s * 1000,
        )
        record_model_call(
            span=span,
            operation="chat",
            provider=self._llm.provider_name,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_s=elapsed_s,
            cost_usd=usage.cost_usd,
            tenant_id=principal.tenant_id,
        )
        return usage

    @staticmethod
    def _root_attrs(principal: Principal) -> dict[str, Any]:
        return {"rag.tenant_id": principal.tenant_id, "rag.prompt_version": PROMPT_VERSION}

    @staticmethod
    def _finish_span(span: trace.Span, answer: Answer) -> None:
        span.set_attribute("rag.refused", answer.refused)
        if answer.refusal_reason:
            span.set_attribute("rag.refusal_reason", answer.refusal_reason.value)
        span.set_attribute("rag.cache.hit", answer.cached)
        span.set_attribute("rag.citations", len(answer.citations))
        span.set_attribute("rag.cost_usd", round(answer.usage.cost_usd, 8))
        span.set_attribute("gen_ai.usage.input_tokens", answer.usage.input_tokens)
        span.set_attribute("gen_ai.usage.output_tokens", answer.usage.output_tokens)
        log.info(
            "query.answered",
            refused=answer.refused,
            reason=answer.refusal_reason,
            cached=answer.cached,
            citations=len(answer.citations),
            cost_usd=round(answer.usage.cost_usd, 8),
        )

    @staticmethod
    def _source_dict(c: Candidate) -> dict[str, Any]:
        return {
            "chunk_id": str(c.chunk_id),
            "document_id": str(c.document_id),
            "title": c.document_title,
            "section": " > ".join(c.section_path),
            "score": round(c.relevance, 4),
        }


# ---------------------------------------------------------------------- serialization


def citation_to_dict(c: Citation) -> dict[str, Any]:
    return {
        "chunk_id": str(c.chunk_id),
        "document_id": str(c.document_id),
        "document_title": c.document_title,
        "section": c.section,
        "page": c.page,
        "snippet": c.snippet,
    }


def answer_to_dict(a: Answer) -> dict[str, Any]:
    return {
        "answer": a.text,
        "citations": [citation_to_dict(c) for c in a.citations],
        "refused": a.refused,
        "refusal_reason": a.refusal_reason.value if a.refusal_reason else None,
        "rewritten_query": a.rewritten_query,
        "cached": a.cached,
        "usage": {
            "input_tokens": a.usage.input_tokens,
            "output_tokens": a.usage.output_tokens,
            "cost_usd": round(a.usage.cost_usd, 8),
        },
        "guardrails": a.guardrails,
    }


def answer_from_dict(d: dict[str, Any]) -> Answer:
    reason = d.get("refusal_reason")
    return Answer(
        text=str(d["answer"]),
        citations=[
            Citation(
                chunk_id=UUID(c["chunk_id"]),
                document_id=UUID(c["document_id"]),
                document_title=c["document_title"],
                section=c["section"],
                page=c.get("page"),
                snippet=c["snippet"],
            )
            for c in d.get("citations", [])
        ],
        refused=bool(d.get("refused")),
        refusal_reason=RefusalReason(reason) if reason else None,
        rewritten_query=str(d.get("rewritten_query", "")),
        usage=TokenUsage(),
    )
