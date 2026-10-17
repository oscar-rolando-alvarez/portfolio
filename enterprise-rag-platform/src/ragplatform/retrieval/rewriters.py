"""Query rewriting: turns conversational input into a focused, standalone search query."""

from __future__ import annotations

import re
from collections.abc import Sequence

from ragplatform.domain.ports import ChatMessage, LLMProvider
from ragplatform.domain.text import normalize_ws
from ragplatform.generation.prompts import build_rewrite_messages

_FILLER = re.compile(
    r"^(hi|hello|hey)[,!.\s]+|"
    r"\b(can|could|would) you (please )?(tell me|explain|let me know|help me understand)\b|"
    r"\b(i('d| would) like to know|i want to know|do you know|please)\b",
    re.IGNORECASE,
)
_PRONOUN_FOLLOWUP = re.compile(r"^(and|what about|how about)\b|\b(it|that|this|they|those)\b", re.I)


class HeuristicQueryRewriter:
    """Deterministic rewriter: strips conversational filler and, for short follow-ups
    ("and for contractors?"), prepends the previous user question for context."""

    async def rewrite(self, query: str, history: Sequence[ChatMessage]) -> str:
        cleaned = normalize_ws(_FILLER.sub(" ", query)).strip(" ?.!,") or query.strip()
        previous = next((m.content for m in reversed(history) if m.role == "user"), None)
        if previous and len(cleaned.split()) <= 6 and _PRONOUN_FOLLOWUP.search(cleaned):
            cleaned = f"{normalize_ws(_FILLER.sub(' ', previous)).strip(' ?.!,')} {cleaned}"
        return cleaned


class LLMQueryRewriter:
    """Uses the configured chat model; falls back to the heuristic on any failure."""

    def __init__(self, llm: LLMProvider, fallback: HeuristicQueryRewriter | None = None) -> None:
        self._llm = llm
        self._fallback = fallback or HeuristicQueryRewriter()

    async def rewrite(self, query: str, history: Sequence[ChatMessage]) -> str:
        try:
            out = await self._llm.complete(
                build_rewrite_messages(query, history), max_tokens=64, temperature=0.0
            )
        except Exception:
            return await self._fallback.rewrite(query, history)
        text = normalize_ws(out.text).strip('"')
        return text if 0 < len(text) <= 512 else await self._fallback.rewrite(query, history)
