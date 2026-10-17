"""Recommendation engines: popularity, item-item CF, TF-IDF content and semantic embeddings."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

from recommender.genai.vectorstore import VectorStore
from recommender.recommendation.base import Scored, Snapshot, Strategy, top_k


class PopularityRecommender:
    """Cold-start baseline: total interaction strength per item (log-damped)."""

    name = Strategy.POPULARITY

    def __init__(self, snapshot: Snapshot) -> None:
        self._snapshot = snapshot
        totals = np.asarray(snapshot.matrix.sum(axis=0)).ravel()
        self._scores = np.log1p(totals)

    async def recommend(
        self, user_id: uuid.UUID, limit: int, *, exclude: Iterable[uuid.UUID] = ()
    ) -> list[Scored]:
        seen = set(self._snapshot.user_items(user_id)) | set(exclude)
        return top_k(self._scores, self._snapshot, limit, seen, "Popular with other users")


class ItemCollaborativeRecommender:
    """Item-item collaborative filtering with cosine similarity on the interaction matrix."""

    name = Strategy.COLLABORATIVE

    def __init__(self, snapshot: Snapshot) -> None:
        self._snapshot = snapshot
        matrix = snapshot.matrix
        norms = np.sqrt(np.asarray(matrix.multiply(matrix).sum(axis=0)).ravel())
        norms[norms == 0] = 1.0
        normalized = matrix.multiply(1.0 / norms).tocsr()
        self._similarity = (normalized.T @ normalized).toarray()
        np.fill_diagonal(self._similarity, 0.0)

    def similar(self, item_id: uuid.UUID) -> np.ndarray | None:
        idx = self._snapshot.item_index.get(item_id)
        return None if idx is None else self._similarity[idx]

    async def recommend(
        self, user_id: uuid.UUID, limit: int, *, exclude: Iterable[uuid.UUID] = ()
    ) -> list[Scored]:
        history = self._snapshot.user_items(user_id)
        if not history:
            return []
        scores = np.zeros(len(self._snapshot.items))
        for item_id, strength in history.items():
            scores += strength * self._similarity[self._snapshot.item_index[item_id]]
        seen = set(history) | set(exclude)
        return top_k(scores, self._snapshot, limit, seen, "Users with similar taste engaged")


class ContentRecommender:
    """TF-IDF over item title/description/category/tags."""

    name = Strategy.CONTENT

    def __init__(self, snapshot: Snapshot) -> None:
        self._snapshot = snapshot
        if snapshot.items:
            vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=1)
            tfidf = vectorizer.fit_transform([item.document for item in snapshot.items])
            self._similarity = linear_kernel(tfidf, tfidf)
            np.fill_diagonal(self._similarity, 0.0)
        else:
            self._similarity = np.zeros((0, 0))

    def similar(self, item_id: uuid.UUID) -> np.ndarray | None:
        idx = self._snapshot.item_index.get(item_id)
        return None if idx is None else self._similarity[idx]

    async def recommend(
        self, user_id: uuid.UUID, limit: int, *, exclude: Iterable[uuid.UUID] = ()
    ) -> list[Scored]:
        history = self._snapshot.user_items(user_id)
        if not history:
            return []
        scores = np.zeros(len(self._snapshot.items))
        for item_id, strength in history.items():
            scores += strength * self._similarity[self._snapshot.item_index[item_id]]
        seen = set(history) | set(exclude)
        return top_k(scores, self._snapshot, limit, seen, "Similar content to items you liked")


class SemanticRecommender:
    """Embedding-based: user profile = strength-weighted mean of interacted item vectors."""

    name = Strategy.SEMANTIC

    def __init__(self, snapshot: Snapshot, store: VectorStore) -> None:
        self._snapshot = snapshot
        self._store = store

    async def profile(self, user_id: uuid.UUID) -> np.ndarray | None:
        history = self._snapshot.user_items(user_id)
        vectors, weights = [], []
        for item_id, strength in history.items():
            vector = await self._store.get(item_id)
            if vector is not None:
                vectors.append(vector)
                weights.append(strength)
        if not vectors:
            return None
        profile = np.average(np.asarray(vectors), axis=0, weights=np.asarray(weights))
        norm = float(np.linalg.norm(profile))
        return None if norm == 0 else profile / norm

    async def recommend(
        self, user_id: uuid.UUID, limit: int, *, exclude: Iterable[uuid.UUID] = ()
    ) -> list[Scored]:
        profile = await self.profile(user_id)
        if profile is None:
            return []
        seen = set(self._snapshot.user_items(user_id)) | set(exclude)
        hits = await self._store.search(profile.tolist(), limit, exclude=seen)
        return [
            Scored(item_id, score, "Semantically close to your interests")
            for item_id, score in hits
            if score > 0 and item_id in self._snapshot.item_index
        ]
