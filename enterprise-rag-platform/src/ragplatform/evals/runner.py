"""Offline evaluation harness.

1. Ingest the golden corpus into a fresh, uniquely named tenant (plus a decoy tenant).
2. For every golden item, run retrieval (for recall/MRR/ACL-leak checks) and the full
   answer pipeline (for citations, faithfulness, correctness, refusal, PII/injection).
3. Aggregate, compare against thresholds, and emit a JSON report.

Runs against whatever the configuration wires up: in-memory + fakes by default, or
PostgreSQL/pgvector and a real OpenAI-compatible model when configured. ``judge="llm"``
adds LLM-as-judge faithfulness/relevance scores using the configured chat model.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID

from ragplatform.container import Container
from ragplatform.domain.models import Principal, Role
from ragplatform.domain.ports import ChatMessage
from ragplatform.evals import metrics
from ragplatform.generation.prompts import build_judge_messages


@dataclass(slots=True)
class GoldenItem:
    id: str
    question: str
    groups: list[str]
    answerable: bool
    category: str = "general"
    expected_docs: list[str] = field(default_factory=list)
    expected_facts: list[str] = field(default_factory=list)
    forbidden_docs: list[str] = field(default_factory=list)
    forbidden_strings: list[str] = field(default_factory=list)
    history: list[dict[str, str]] = field(default_factory=list)


@dataclass(slots=True)
class ItemResult:
    id: str
    category: str
    answerable: bool
    refused: bool
    refusal_reason: str | None
    answer: str
    retrieved_docs: list[str]
    cited_docs: list[str]
    recall_at_k: float | None
    reciprocal_rank: float | None
    citation_precision: float | None
    faithfulness: float | None
    answer_correct: bool | None
    refusal_correct: bool
    acl_leak: bool
    forbidden_hits: list[str]
    latency_ms: float
    cost_usd: float
    judge: dict[str, float] | None = None


@dataclass(slots=True)
class EvalReport:
    backend: str
    llm_model: str
    embedding_model: str
    k: int
    items: int
    metrics: dict[str, float]
    by_category: dict[str, dict[str, float]]
    failures: list[str]
    passed: bool
    results: list[ItemResult]

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, default=str)


def load_golden(path: Path) -> list[GoldenItem]:
    return [
        GoldenItem(**json.loads(line)) for line in path.read_text().splitlines() if line.strip()
    ]


def check_thresholds(
    values: dict[str, float], thresholds: dict[str, dict[str, float]]
) -> list[str]:
    failures = []
    for name, bound in thresholds.items():
        value = values.get(name)
        if value is None:
            failures.append(f"{name}: missing")
            continue
        if "min" in bound and value < bound["min"]:
            failures.append(f"{name}={value:.3f} < min {bound['min']}")
        if "max" in bound and value > bound["max"]:
            failures.append(f"{name}={value:.3f} > max {bound['max']}")
    return failures


class EvalRunner:
    def __init__(self, container: Container, *, k: int = 5, judge: str = "none") -> None:
        self._c = container
        self._k = k
        self._judge = judge
        run = uuid.uuid4().hex[:8]
        self.tenant = f"eval-{run}"
        self.decoy_tenant = f"eval-{run}-other"
        self._doc_names: dict[UUID, str] = {}

    async def ingest_corpus(self, corpus_dir: Path) -> None:
        manifest = json.loads((corpus_dir / "manifest.json").read_text())
        for entry in manifest["documents"]:
            tenant = self.decoy_tenant if entry.get("tenant") == "other" else self.tenant
            admin = Principal(tenant, "eval-admin", frozenset(), frozenset({Role.ADMIN.value}))
            path = corpus_dir / entry["file"]
            result = await self._c.ingestion.submit(
                admin,
                data=path.read_bytes(),
                filename=path.name,
                mime_type=None,
                external_id=entry["external_id"],
                acl_groups=entry["acl_groups"],
                redact_pii=True,
            )
            self._doc_names[result.document.id] = entry["external_id"]
        await self._c.worker.drain()

    async def run(
        self, items: list[GoldenItem], thresholds: dict[str, dict[str, float]]
    ) -> EvalReport:
        results = [await self._run_item(item) for item in items]
        values = self._aggregate(results)
        by_cat: dict[str, dict[str, float]] = {}
        for cat in sorted({r.category for r in results}):
            subset = [r for r in results if r.category == cat]
            by_cat[cat] = {
                "items": len(subset),
                "refusal_accuracy": sum(r.refusal_correct for r in subset) / len(subset),
            }
        failures = check_thresholds(values, thresholds)
        s = self._c.settings
        return EvalReport(
            backend="postgres" if s.database_url else "memory",
            llm_model=self._c.llm.model,
            embedding_model=self._c.embedder.model,
            k=self._k,
            items=len(results),
            metrics=values,
            by_category=by_cat,
            failures=failures,
            passed=not failures,
            results=results,
        )

    async def _run_item(self, item: GoldenItem) -> ItemResult:
        principal = Principal(self.tenant, f"eval-user-{item.id}", frozenset(item.groups))
        history = [ChatMessage(h["role"], h["content"]) for h in item.history]  # type: ignore[arg-type]
        prepared = await self._c.retrieval.prepare(principal, item.question, history)
        retrieval = await self._c.retrieval.search(principal, prepared, top_k=self._k)
        retrieved_docs = [self._doc_names.get(c.document_id, "?") for c in retrieval.candidates]

        started = time.perf_counter()
        answer = await self._c.answers.answer(principal, item.question, history, use_cache=False)
        latency_ms = (time.perf_counter() - started) * 1000

        answer_docs = [self._doc_names.get(c.document_id, "?") for c in answer.retrieved]
        cited_docs = [self._doc_names.get(c.document_id, "?") for c in answer.citations]
        evidence = [
            c.content
            for c in answer.retrieved
            if any(cit.chunk_id == c.chunk_id for cit in answer.citations)
        ]
        relevant = set(item.expected_docs)
        forbidden_docs = set(item.forbidden_docs)

        scored = item.answerable and not answer.refused
        result = ItemResult(
            id=item.id,
            category=item.category,
            answerable=item.answerable,
            refused=answer.refused,
            refusal_reason=answer.refusal_reason.value if answer.refusal_reason else None,
            answer=answer.text,
            retrieved_docs=retrieved_docs,
            cited_docs=cited_docs,
            recall_at_k=metrics.recall_at_k(retrieved_docs, relevant, self._k)
            if relevant
            else None,
            reciprocal_rank=metrics.reciprocal_rank(retrieved_docs, relevant) if relevant else None,
            citation_precision=metrics.citation_precision(cited_docs, relevant) if scored else None,
            faithfulness=metrics.faithfulness(answer.text, evidence) if scored else None,
            answer_correct=metrics.contains_all(answer.text, item.expected_facts)
            if item.answerable
            else None,
            refusal_correct=answer.refused != item.answerable,
            acl_leak=bool(
                forbidden_docs & (set(retrieved_docs) | set(answer_docs) | set(cited_docs))
            ),
            forbidden_hits=[s for s in item.forbidden_strings if s.lower() in answer.text.lower()],
            latency_ms=latency_ms,
            cost_usd=answer.usage.cost_usd,
        )
        if self._judge == "llm" and scored:
            result.judge = await self._llm_judge(item.question, "\n".join(evidence), answer.text)
        return result

    async def _llm_judge(self, question: str, evidence: str, answer: str) -> dict[str, float]:
        out = await self._c.llm.complete(
            build_judge_messages(question, evidence, answer), max_tokens=100, temperature=0.0
        )
        match = re.search(r"\{.*\}", out.text, re.DOTALL)
        try:
            data: dict[str, Any] = json.loads(match.group(0)) if match else {}
            return {k: float(data.get(k, 0.0)) for k in ("faithfulness", "relevance")}
        except (ValueError, TypeError):
            return {"faithfulness": 0.0, "relevance": 0.0}

    def _aggregate(self, results: list[ItemResult]) -> dict[str, float]:
        def mean(values: list[float]) -> float:
            return round(sum(values) / len(values), 4) if values else 0.0

        values = {
            "recall_at_k": mean([r.recall_at_k for r in results if r.recall_at_k is not None]),
            "mrr": mean([r.reciprocal_rank for r in results if r.reciprocal_rank is not None]),
            "citation_precision": mean(
                [r.citation_precision for r in results if r.citation_precision is not None]
            ),
            "faithfulness": mean([r.faithfulness for r in results if r.faithfulness is not None]),
            "answer_accuracy": mean(
                [1.0 if r.answer_correct else 0.0 for r in results if r.answer_correct is not None]
            ),
            "refusal_accuracy": mean([1.0 if r.refusal_correct else 0.0 for r in results]),
            "acl_leaks": float(sum(r.acl_leak for r in results)),
            "forbidden_string_hits": float(sum(len(r.forbidden_hits) for r in results)),
            "latency_p50_ms": round(metrics.percentile([r.latency_ms for r in results], 0.5), 2),
            "latency_p95_ms": round(metrics.percentile([r.latency_ms for r in results], 0.95), 2),
            "cost_usd_total": round(sum(r.cost_usd for r in results), 6),
        }
        judged = [r.judge for r in results if r.judge]
        if judged:
            values["judge_faithfulness"] = mean([j["faithfulness"] for j in judged])
            values["judge_relevance"] = mean([j["relevance"] for j in judged])
        return values
