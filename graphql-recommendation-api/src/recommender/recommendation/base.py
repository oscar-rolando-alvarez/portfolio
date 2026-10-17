"""Shared types for recommendation engines.

Engines work on an immutable in-memory `Snapshot` of the catalog and interaction log, so they are
pure, fast to unit test and independent of the database.
"""

from __future__ import annotations

import enum
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from functools import cached_property
from typing import Protocol

import numpy as np
from scipy.sparse import csr_matrix


class Strategy(enum.StrEnum):
    HYBRID = "hybrid"
    COLLABORATIVE = "collaborative"
    CONTENT = "content"
    SEMANTIC = "semantic"
    POPULARITY = "popularity"


@dataclass(frozen=True, slots=True)
class ItemRecord:
    id: uuid.UUID
    document: str
    category: str


@dataclass(frozen=True, slots=True)
class InteractionRecord:
    user_id: uuid.UUID
    item_id: uuid.UUID
    strength: float


@dataclass(frozen=True, slots=True)
class Scored:
    item_id: uuid.UUID
    score: float
    reason: str


@dataclass(frozen=True)
class Snapshot:
    items: Sequence[ItemRecord]
    interactions: Sequence[InteractionRecord] = field(default_factory=tuple)

    @cached_property
    def item_index(self) -> dict[uuid.UUID, int]:
        return {item.id: i for i, item in enumerate(self.items)}

    @cached_property
    def user_index(self) -> dict[uuid.UUID, int]:
        users = dict.fromkeys(i.user_id for i in self.interactions)
        return {user_id: i for i, user_id in enumerate(users)}

    @cached_property
    def matrix(self) -> csr_matrix:
        """User x item matrix of summed interaction strengths."""
        rows, cols, vals = [], [], []
        for inter in self.interactions:
            col = self.item_index.get(inter.item_id)
            if col is None:
                continue
            rows.append(self.user_index[inter.user_id])
            cols.append(col)
            vals.append(inter.strength)
        shape = (len(self.user_index), len(self.items))
        return csr_matrix((vals, (rows, cols)), shape=shape, dtype=np.float64)

    def user_items(self, user_id: uuid.UUID) -> dict[uuid.UUID, float]:
        """Items the user interacted with and the summed strength."""
        row = self.user_index.get(user_id)
        if row is None:
            return {}
        user_row = self.matrix.getrow(row)
        return {
            self.items[int(c)].id: float(v)
            for c, v in zip(user_row.indices, user_row.data, strict=True)
        }


class Recommender(Protocol):
    name: Strategy

    async def recommend(
        self, user_id: uuid.UUID, limit: int, *, exclude: Iterable[uuid.UUID] = ()
    ) -> list[Scored]: ...


def top_k(
    scores: np.ndarray,
    snapshot: Snapshot,
    limit: int,
    exclude: Iterable[uuid.UUID],
    reason: str,
) -> list[Scored]:
    """Pick the best positive scores, skipping excluded item ids."""
    if limit <= 0:
        return []
    excluded = {snapshot.item_index[i] for i in exclude if i in snapshot.item_index}
    order = np.argsort(-scores, kind="stable")
    result: list[Scored] = []
    for idx in order:
        i = int(idx)
        if i in excluded or scores[i] <= 0:
            continue
        result.append(Scored(snapshot.items[i].id, float(scores[i]), reason))
        if len(result) == limit:
            break
    return result
