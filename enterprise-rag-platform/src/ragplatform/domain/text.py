"""Small, dependency-free text utilities shared by chunking, fakes, reranking and evals."""

from __future__ import annotations

import hashlib
import re

_WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_\-']*")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\[\"(])")

STOPWORDS = frozenset(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "been",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "for",
        "from",
        "had",
        "has",
        "have",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "may",
        "me",
        "my",
        "no",
        "not",
        "of",
        "on",
        "or",
        "our",
        "please",
        "should",
        "so",
        "than",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "to",
        "tell",
        "us",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "who",
        "whom",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
        "about",
        "any",
        "all",
        "also",
        "am",
        "each",
        "just",
        "more",
        "most",
        "other",
        "over",
        "some",
        "such",
        "only",
        "own",
        "same",
        "very",
        "s",
        "t",
        "don",
        "now",
        "get",
        "got",
    ]
)


def words(text: str) -> list[str]:
    return [w.lower() for w in _WORD_RE.findall(text)]


def content_terms(text: str) -> list[str]:
    """Lower-cased tokens without stopwords, lightly stemmed (plural 's')."""
    out: list[str] = []
    for word in words(text):
        if word in STOPWORDS or len(word) < 2:
            continue
        stem = (
            word[:-1] if len(word) > 4 and word.endswith("s") and not word.endswith("ss") else word
        )
        out.append(stem)
    return out


def estimate_tokens(text: str) -> int:
    """Provider-agnostic token estimate (~0.75 words per token for English prose)."""
    n = len(_WORD_RE.findall(text))
    return max(1, round(n * 1.33)) if text.strip() else 0


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.split(text.strip()) if s.strip()]


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode()
    return hashlib.sha256(data).hexdigest()


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()
