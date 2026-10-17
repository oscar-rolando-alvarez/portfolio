"""Reciprocal Rank Fusion (Cormack, Clarke & Buettcher, SIGIR 2009).

RRF only uses ranks, so it fuses BM25-style and cosine scores without any score
calibration: ``score(d) = sum_r weight_r / (k + rank_r(d))``.
"""

from __future__ import annotations

from ragplatform.domain.models import Candidate


def reciprocal_rank_fusion(
    candidates: list[Candidate],
    *,
    k: int = 60,
    lexical_weight: float = 1.0,
    vector_weight: float = 1.0,
) -> list[Candidate]:
    """Assign ``fused_score`` from the per-retriever ranks and sort descending.

    Scores are normalised to 0..1 by the best achievable score (rank 1 in both lists),
    which makes the refusal threshold independent of ``k``.
    """
    best = lexical_weight / (k + 1) + vector_weight / (k + 1)
    for c in candidates:
        score = 0.0
        if c.lexical_rank is not None:
            score += lexical_weight / (k + c.lexical_rank)
        if c.vector_rank is not None:
            score += vector_weight / (k + c.vector_rank)
        c.fused_score = score / best
    return sorted(candidates, key=lambda c: (-c.fused_score, str(c.chunk_id)))
