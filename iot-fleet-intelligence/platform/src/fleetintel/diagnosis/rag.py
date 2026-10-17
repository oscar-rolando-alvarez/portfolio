"""Retrieval over the connectivity runbook corpus.

The corpus is small (tens of sections), so the index is built in memory at
cold start: embeddings + metadata filter boost (hybrid retrieval). At larger
scale swap ``RunbookIndex`` for OpenSearch Serverless / pgvector / S3 Vectors
behind the same interface.
"""

from __future__ import annotations

import hashlib
import itertools
import math
import re
from dataclasses import dataclass
from importlib import resources

from fleetintel.ports import EmbeddingProvider

_TOKEN = re.compile(r"[a-z0-9#]+")


@dataclass(frozen=True, slots=True)
class Chunk:
    runbook_id: str
    title: str
    section: str
    text: str
    fault_types: frozenset[str]

    @property
    def chunk_id(self) -> str:
        return f"{self.runbook_id}#{self.section.lower().replace(' ', '-')}"


def load_runbooks() -> list[Chunk]:
    chunks: list[Chunk] = []
    root = resources.files("fleetintel.diagnosis").joinpath("runbooks")
    for entry in sorted(root.iterdir(), key=lambda p: p.name):
        if not entry.name.endswith(".md"):
            continue
        raw = entry.read_text(encoding="utf-8")
        _, front, body = raw.split("---", 2)
        pairs = (line.split(":", 1) for line in front.strip().splitlines())
        meta = {k.strip(): v.strip() for k, v in pairs}
        faults = frozenset(f.strip() for f in meta["fault_types"].split(","))
        for part in body.split("\n## ")[1:]:
            section, _, text = part.partition("\n")
            chunks.append(Chunk(meta["id"], meta["title"], section.strip(), text.strip(), faults))
    return chunks


class HashingEmbeddings:
    """Deterministic feature-hashing embeddings (offline fake for CI/evals).

    Bag of unigrams + bigrams hashed into ``dims`` signed buckets and L2
    normalised. Good enough to rank a small domain corpus; swap for a real
    embedding model via the OpenAI-compatible adapter.
    """

    name = "hashing"

    def __init__(self, dims: int = 512) -> None:
        self.dims = dims

    def _vec(self, text: str) -> list[float]:
        v = [0.0] * self.dims
        toks = _TOKEN.findall(text.lower())
        for gram in toks + [f"{a}_{b}" for a, b in itertools.pairwise(toks)]:
            h = int.from_bytes(hashlib.blake2b(gram.encode(), digest_size=8).digest(), "big")
            v[h % self.dims] += 1.0 if (h >> 63) & 1 else -1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]


@dataclass(frozen=True, slots=True)
class Retrieved:
    chunk: Chunk
    score: float


class RunbookIndex:
    def __init__(self, embedder: EmbeddingProvider, chunks: list[Chunk] | None = None) -> None:
        self.embedder = embedder
        self.chunks = chunks if chunks is not None else load_runbooks()
        self.vectors = embedder.embed([f"{c.title}. {c.section}. {c.text}" for c in self.chunks])

    def search(self, query: str, k: int = 3, fault_hint: str | None = None) -> list[Retrieved]:
        q = self.embedder.embed([query])[0]
        scored = []
        for c, v in zip(self.chunks, self.vectors, strict=True):
            s = sum(a * b for a, b in zip(q, v, strict=True))
            if fault_hint and fault_hint in c.fault_types:
                s += 0.25 / max(len(c.fault_types), 1) ** 0.5  # metadata boost (hybrid)
            scored.append(Retrieved(c, round(s, 4)))
        scored.sort(key=lambda r: (-r.score, r.chunk.chunk_id))
        # at most two sections per runbook keeps the context diverse
        out: list[Retrieved] = []
        per_book: dict[str, int] = {}
        for r in scored:
            if per_book.get(r.chunk.runbook_id, 0) >= 2:
                continue
            per_book[r.chunk.runbook_id] = per_book.get(r.chunk.runbook_id, 0) + 1
            out.append(r)
            if len(out) == k:
                break
        return out
