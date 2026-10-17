"""Weighted hybrid recommender with per-engine min-max score normalization."""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from collections.abc import Iterable, Mapping

from recommender.recommendation.base import Recommender, Scored, Strategy


def _normalize(results: list[Scored]) -> dict[uuid.UUID, float]:
    if not results:
        return {}
    scores = [r.score for r in results]
    lo, hi = min(scores), max(scores)
    if hi == lo:
        return {r.item_id: 1.0 for r in results}
    return {r.item_id: (r.score - lo) / (hi - lo) for r in results}


class HybridRecommender:
    """Blends engines by weight; the explanation comes from the strongest contributor.

    Engines that return nothing for a user (e.g. collaborative on cold start) simply drop out,
    so new users still receive popularity-based recommendations.
    """

    name = Strategy.HYBRID

    def __init__(self, engines: Mapping[Recommender, float], candidate_factor: int = 3) -> None:
        self._engines = {engine: weight for engine, weight in engines.items() if weight > 0}
        self._candidate_factor = candidate_factor

    async def recommend(
        self, user_id: uuid.UUID, limit: int, *, exclude: Iterable[uuid.UUID] = ()
    ) -> list[Scored]:
        excluded = list(exclude)
        engines = list(self._engines)
        results = await asyncio.gather(
            *(
                engine.recommend(user_id, limit * self._candidate_factor, exclude=excluded)
                for engine in engines
            )
        )
        totals: dict[uuid.UUID, float] = defaultdict(float)
        best: dict[uuid.UUID, tuple[float, str]] = {}
        for engine, result in zip(engines, results, strict=True):
            reasons = {r.item_id: r.reason for r in result}
            for item_id, norm_score in _normalize(result).items():
                contribution = self._engines[engine] * norm_score
                totals[item_id] += contribution
                if contribution > best.get(item_id, (-1.0, ""))[0]:
                    best[item_id] = (contribution, reasons[item_id])
        ranked = sorted(totals.items(), key=lambda kv: (-kv[1], str(kv[0])))[:limit]
        return [Scored(item_id, score, best[item_id][1]) for item_id, score in ranked]
