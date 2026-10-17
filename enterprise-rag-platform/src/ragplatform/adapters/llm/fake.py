"""Deterministic offline providers used by tests, CI evals and the no-key demo.

* ``HashingEmbeddingProvider``: signed feature hashing of terms + bigrams, L2-normalised.
  Lexically similar texts get similar vectors, which is enough to exercise ANN search,
  RRF fusion and the semantic cache realistically.
* ``ExtractiveFakeLLM``: reads the ``<source>`` blocks of the grounded prompt and answers by
  quoting the sentences that best cover the question, citing their chunk IDs; returns the
  refusal sentinel when nothing is relevant. It is a *faithful-by-construction* model, so
  evals measure the retrieval/guardrail pipeline rather than model creativity.
"""

from __future__ import annotations

import asyncio
import hashlib
import itertools
import json
import math
import re
from collections.abc import AsyncIterator, Sequence

from ragplatform.domain.ports import ChatMessage, Completion, EmbeddingResult, StreamDelta
from ragplatform.domain.text import content_terms, estimate_tokens, split_sentences
from ragplatform.generation.prompts import (
    INSUFFICIENT_EVIDENCE,
    TASK_ANSWER,
    TASK_JUDGE,
    TASK_RERANK,
    TASK_REWRITE,
)

_SOURCE_RE = re.compile(r'<source id="([^"]+)"[^>]*>\n?(.*?)\n?</source>', re.DOTALL)
_QUESTION_RE = re.compile(r"^Question:\s*(.+)$", re.MULTILINE)


class HashingEmbeddingProvider:
    def __init__(self, dim: int = 384, model: str = "fake-hash-embedding") -> None:
        self._dim = dim
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider_name(self) -> str:
        return "fake"

    def embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self._dim
        terms = content_terms(text)
        features = terms + [f"{a}_{b}" for a, b in itertools.pairwise(terms)]
        for feat in features:
            h = hashlib.blake2b(feat.encode(), digest_size=8).digest()
            idx = int.from_bytes(h[:4], "big") % self._dim
            sign = 1.0 if h[4] & 1 else -1.0
            vec[idx] += sign * (0.5 if "_" in feat else 1.0)
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def embed(self, texts: Sequence[str]) -> EmbeddingResult:
        return EmbeddingResult(
            vectors=[self.embed_one(t) for t in texts],
            input_tokens=sum(estimate_tokens(t) for t in texts),
        )


class ExtractiveFakeLLM:
    def __init__(self, model: str = "fake-extractive-1", min_coverage: float = 0.34) -> None:
        self._model = model
        self._min_coverage = min_coverage

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider_name(self) -> str:
        return "fake"

    async def complete(
        self, messages: Sequence[ChatMessage], *, max_tokens: int, temperature: float
    ) -> Completion:
        text = self._respond(messages)
        words = text.split()
        if estimate_tokens(text) > max_tokens:
            text = " ".join(words[: int(max_tokens / 1.33)])
        prompt = "\n".join(m.content for m in messages)
        return Completion(
            text=text,
            input_tokens=estimate_tokens(prompt),
            output_tokens=estimate_tokens(text),
            model=self._model,
        )

    async def stream(
        self, messages: Sequence[ChatMessage], *, max_tokens: int, temperature: float
    ) -> AsyncIterator[StreamDelta]:
        completion = await self.complete(messages, max_tokens=max_tokens, temperature=temperature)
        tokens = re.findall(r"\S+\s*", completion.text)
        for i in range(0, len(tokens), 3):
            await asyncio.sleep(0)
            yield StreamDelta(text="".join(tokens[i : i + 3]))
        yield StreamDelta(
            done=True,
            input_tokens=completion.input_tokens,
            output_tokens=completion.output_tokens,
            model=self._model,
        )

    # ------------------------------------------------------------------ behaviour
    def _respond(self, messages: Sequence[ChatMessage]) -> str:
        system = next((m.content for m in messages if m.role == "system"), "")
        user = messages[-1].content if messages else ""
        if TASK_REWRITE in system:
            return user.strip().splitlines()[-1].removeprefix("Question:").strip()
        if TASK_RERANK in system:
            return self._rerank(user)
        if TASK_JUDGE in system:
            return self._judge(user)
        if TASK_ANSWER in system:
            return self._answer(user)
        return "OK"

    def _best_sentences(
        self, question: str, sources: list[tuple[str, str]]
    ) -> list[tuple[float, str, str]]:
        q_terms = set(content_terms(question))
        if not q_terms:
            return []
        scored: list[tuple[float, str, str]] = []
        for chunk_id, body in sources:
            for sentence in split_sentences(body.replace("\n", " ")):
                s_terms = set(content_terms(sentence))
                coverage = len(q_terms & s_terms) / len(q_terms)
                if coverage >= self._min_coverage:
                    scored.append((coverage, chunk_id, sentence))
        scored.sort(key=lambda t: -t[0])
        return scored

    def _answer(self, prompt: str) -> str:
        m = _QUESTION_RE.search(prompt)
        question = m.group(1) if m else ""
        sources = _SOURCE_RE.findall(prompt)
        best = self._best_sentences(question, sources)
        if not best:
            return INSUFFICIENT_EVIDENCE
        top = best[0][0]
        picked: list[str] = []
        seen: set[str] = set()
        for coverage, chunk_id, sentence in best:
            if coverage < top * 0.75 or len(picked) >= 3 or sentence in seen:
                continue
            seen.add(sentence)
            picked.append(f"{sentence.rstrip()} [{chunk_id}]")
        return " ".join(picked)

    def _rerank(self, prompt: str) -> str:
        m = _QUESTION_RE.search(prompt)
        q_terms = set(content_terms(m.group(1) if m else ""))
        scores: dict[str, float] = {}
        for chunk_id, body in _SOURCE_RE.findall(prompt):
            terms = set(content_terms(body))
            scores[chunk_id] = round(10 * len(q_terms & terms) / max(1, len(q_terms)), 2)
        return json.dumps(scores)

    def _judge(self, prompt: str) -> str:
        answer = prompt.split("ANSWER:", 1)[-1]
        evidence = prompt.split("EVIDENCE:", 1)[-1].split("ANSWER:", 1)[0]
        e_terms = set(content_terms(evidence))
        sentences = split_sentences(re.sub(r"\[[^\]]+\]", "", answer))
        if not sentences:
            return json.dumps({"faithfulness": 1.0, "relevance": 0.0})
        supported = sum(
            1
            for s in sentences
            if (t := set(content_terms(s))) and len(t & e_terms) / len(t) >= 0.6
        )
        return json.dumps({"faithfulness": supported / len(sentences), "relevance": 1.0})
