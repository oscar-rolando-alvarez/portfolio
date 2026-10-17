"""Deterministic RAG metrics (no model required)."""

from __future__ import annotations

import re
from collections.abc import Sequence

from ragplatform.domain.text import content_terms, split_sentences

_CITATION = re.compile(r"\[[^\]]*\]")


def recall_at_k(retrieved_docs: Sequence[str], relevant: set[str], k: int) -> float:
    """1.0 if any of the first k retrieved chunks belongs to a relevant document."""
    return 1.0 if any(d in relevant for d in retrieved_docs[:k]) else 0.0


def reciprocal_rank(retrieved_docs: Sequence[str], relevant: set[str]) -> float:
    for i, d in enumerate(retrieved_docs, start=1):
        if d in relevant:
            return 1.0 / i
    return 0.0


def citation_precision(cited_docs: Sequence[str], relevant: set[str]) -> float:
    if not cited_docs:
        return 0.0
    return sum(1 for d in cited_docs if d in relevant) / len(cited_docs)


def faithfulness(answer: str, evidence: Sequence[str], *, min_support: float = 0.6) -> float:
    """Fraction of answer sentences whose content terms are mostly present in the cited
    evidence. A lexical proxy for groundedness; the LLM judge provides a semantic one."""
    evidence_terms = set(content_terms(" ".join(evidence)))
    sentences = [s for s in split_sentences(_CITATION.sub("", answer)) if content_terms(s)]
    if not sentences:
        return 0.0
    supported = 0
    for s in sentences:
        terms = set(content_terms(s))
        if len(terms & evidence_terms) / len(terms) >= min_support:
            supported += 1
    return supported / len(sentences)


def contains_all(text: str, facts: Sequence[str]) -> bool:
    low = text.lower()
    return all(f.lower() in low for f in facts)


def percentile(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[idx]
