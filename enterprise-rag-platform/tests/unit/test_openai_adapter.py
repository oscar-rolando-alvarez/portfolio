from __future__ import annotations

import json

import httpx
import pytest

from ragplatform.adapters.llm.openai_compatible import (
    OpenAICompatibleChat,
    OpenAICompatibleEmbeddings,
)
from ragplatform.domain.errors import ProviderError
from ragplatform.domain.ports import ChatMessage

MSGS = [ChatMessage("system", "s"), ChatMessage("user", "hello")]


def _client(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url="http://llm.local/v1", transport=handler)


async def test_chat_completion_and_usage() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "model": "served-model",
                "choices": [{"message": {"content": "hi"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3},
            },
        )

    chat = OpenAICompatibleChat(
        base_url="http://llm.local/v1",
        api_key="k",
        model="m",
        client=_client(httpx.MockTransport(handler)),
    )
    out = await chat.complete(MSGS, max_tokens=50, temperature=0.0)
    assert (out.text, out.input_tokens, out.output_tokens, out.model) == (
        "hi",
        12,
        3,
        "served-model",
    )
    assert seen["model"] == "m"
    assert seen["max_tokens"] == 50


async def test_chat_retries_transient_errors() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    chat = OpenAICompatibleChat(
        base_url="http://llm.local/v1",
        api_key=None,
        model="m",
        client=_client(httpx.MockTransport(handler)),
    )
    out = await chat.complete(MSGS, max_tokens=5, temperature=0)
    assert out.text == "ok"
    assert calls["n"] == 3
    assert out.input_tokens > 0  # estimated when the server omits usage


async def test_chat_does_not_retry_client_errors() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"error": "bad"})

    chat = OpenAICompatibleChat(
        base_url="http://llm.local/v1",
        api_key=None,
        model="m",
        client=_client(httpx.MockTransport(handler)),
    )
    with pytest.raises(ProviderError):
        await chat.complete(MSGS, max_tokens=5, temperature=0)
    assert calls["n"] == 1


async def test_chat_streaming_sse() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["stream"] is True
        lines = [
            {"choices": [{"delta": {"content": "Hel"}}]},
            {"choices": [{"delta": {"content": "lo"}}]},
            {"choices": [], "usage": {"prompt_tokens": 7, "completion_tokens": 2}, "model": "x"},
        ]
        payload = "".join(f"data: {json.dumps(x)}\n\n" for x in lines) + "data: [DONE]\n\n"
        return httpx.Response(200, text=payload, headers={"content-type": "text/event-stream"})

    chat = OpenAICompatibleChat(
        base_url="http://llm.local/v1",
        api_key=None,
        model="m",
        client=_client(httpx.MockTransport(handler)),
    )
    deltas = [d async for d in chat.stream(MSGS, max_tokens=5, temperature=0)]
    assert "".join(d.text for d in deltas) == "Hello"
    assert deltas[-1].done
    assert (deltas[-1].input_tokens, deltas[-1].output_tokens, deltas[-1].model) == (7, 2, "x")


async def test_embeddings_batches_and_validates_dim() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        data = [
            {"index": i, "embedding": [0.1] * body["dimensions"]} for i in range(len(body["input"]))
        ]
        return httpx.Response(200, json={"data": data[::-1], "usage": {"prompt_tokens": 4}})

    emb = OpenAICompatibleEmbeddings(
        base_url="http://llm.local/v1",
        api_key=None,
        model="e",
        dim=8,
        batch_size=2,
        client=_client(httpx.MockTransport(handler)),
    )
    out = await emb.embed(["a", "b", "c"])
    assert len(out.vectors) == 3
    assert out.input_tokens == 8  # two batches x 4

    def wrong_dim(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1, 0.2]}]})

    bad = OpenAICompatibleEmbeddings(
        base_url="http://llm.local/v1",
        api_key=None,
        model="e",
        dim=8,
        client=_client(httpx.MockTransport(wrong_dim)),
    )
    with pytest.raises(ProviderError, match="dim"):
        await bad.embed(["a"])
    assert bad.provider_name == "llm.local"
