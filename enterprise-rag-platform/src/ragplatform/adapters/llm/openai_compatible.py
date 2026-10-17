"""Provider-agnostic adapters for any OpenAI-compatible HTTP API
(OpenAI, Azure OpenAI via its v1 endpoint, vLLM, Ollama, LiteLLM proxy, ...).

Only ``base_url``, ``api_key`` and ``model`` are configured; no vendor SDK is required.
Transient failures (timeouts, 429, 5xx) are retried with exponential backoff + jitter.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Sequence
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_random_exponential,
)

from ragplatform.domain.errors import ProviderError
from ragplatform.domain.ports import ChatMessage, Completion, EmbeddingResult, StreamDelta
from ragplatform.domain.text import estimate_tokens


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


def _retrying() -> AsyncRetrying:
    return AsyncRetrying(
        retry=retry_if_exception(_retryable),
        wait=wait_random_exponential(multiplier=0.5, max=8),
        stop=stop_after_attempt(4),
        reraise=True,
    )


class _HttpBase:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        timeout_s: float = 60.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["api-key"] = api_key  # Azure OpenAI accepts this header
        self._client = client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"), headers=headers, timeout=timeout_s
        )
        self._model = model
        self._base_url = base_url

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider_name(self) -> str:
        host = httpx.URL(self._base_url).host
        return host or "openai_compatible"

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async for attempt in _retrying():
                with attempt:
                    resp = await self._client.post(path, json=payload)
                    resp.raise_for_status()
                    data: dict[str, Any] = resp.json()
                    return data
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError(f"{path} failed: {exc}") from exc
        raise ProviderError(f"{path} failed")  # pragma: no cover - loop always returns/raises

    async def aclose(self) -> None:
        await self._client.aclose()


class OpenAICompatibleEmbeddings(_HttpBase):
    def __init__(self, *, dim: int, batch_size: int = 64, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._dim = dim
        self._batch = batch_size

    async def embed(self, texts: Sequence[str]) -> EmbeddingResult:
        vectors: list[list[float]] = []
        tokens = 0
        for i in range(0, len(texts), self._batch):
            batch = list(texts[i : i + self._batch])
            data = await self._post(
                "/embeddings",
                {"model": self._model, "input": batch, "dimensions": self._dim},
            )
            items = sorted(data["data"], key=lambda d: d["index"])
            for item in items:
                vec = item["embedding"]
                if len(vec) != self._dim:
                    raise ProviderError(
                        f"embedding dim {len(vec)} != configured RAG_EMBEDDING_DIM {self._dim}"
                    )
                vectors.append(vec)
            usage = data.get("usage") or {}
            tokens += int(usage.get("prompt_tokens") or sum(estimate_tokens(t) for t in batch))
        return EmbeddingResult(vectors=vectors, input_tokens=tokens)


class OpenAICompatibleChat(_HttpBase):
    def _payload(
        self, messages: Sequence[ChatMessage], max_tokens: int, temperature: float
    ) -> dict[str, Any]:
        return {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

    async def complete(
        self, messages: Sequence[ChatMessage], *, max_tokens: int, temperature: float
    ) -> Completion:
        data = await self._post(
            "/chat/completions", self._payload(messages, max_tokens, temperature)
        )
        try:
            choice = data["choices"][0]
            text = choice["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"malformed completion response: {exc}") from exc
        usage = data.get("usage") or {}
        prompt = "\n".join(m.content for m in messages)
        return Completion(
            text=text,
            input_tokens=int(usage.get("prompt_tokens") or estimate_tokens(prompt)),
            output_tokens=int(usage.get("completion_tokens") or estimate_tokens(text)),
            model=str(data.get("model") or self._model),
            finish_reason=str(choice.get("finish_reason") or "stop"),
        )

    async def stream(
        self, messages: Sequence[ChatMessage], *, max_tokens: int, temperature: float
    ) -> AsyncIterator[StreamDelta]:
        payload = self._payload(messages, max_tokens, temperature)
        payload["stream"] = True
        payload["stream_options"] = {"include_usage": True}
        produced: list[str] = []
        usage: dict[str, Any] = {}
        model = self._model
        try:
            async with self._client.stream("POST", "/chat/completions", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    body = line[5:].strip()
                    if body == "[DONE]":
                        break
                    event = json.loads(body)
                    model = event.get("model") or model
                    if event.get("usage"):
                        usage = event["usage"]
                    for choice in event.get("choices") or []:
                        delta = (choice.get("delta") or {}).get("content")
                        if delta:
                            produced.append(delta)
                            yield StreamDelta(text=delta)
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError(f"streaming failed: {exc}") from exc
        prompt = "\n".join(m.content for m in messages)
        yield StreamDelta(
            done=True,
            input_tokens=int(usage.get("prompt_tokens") or estimate_tokens(prompt)),
            output_tokens=int(usage.get("completion_tokens") or estimate_tokens("".join(produced))),
            model=model,
        )
