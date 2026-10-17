# ADR 0002: OpenAI-compatible API surface and provider adapters

- Status: Accepted
- Date: 2026-10-17

## Context

Teams already use the official OpenAI SDKs, LangChain, LlamaIndex and in-house
clients. If adopting the gateway means changing client code, adoption stalls.
On the upstream side, enterprises mix a hosted vendor (OpenAI, Azure OpenAI) with
self-hosted models (vLLM, Ollama, TGI) for cost, latency or data-residency reasons.

## Decision

- Expose the **OpenAI wire protocol**: `POST /v1/chat/completions` (including SSE
  streaming and `stream_options.include_usage`), `POST /v1/embeddings` and
  `GET /v1/models`. Errors use the OpenAI error envelope and status codes
  (`429` + `insufficient_quota` for budgets, and so on). Existing SDKs only change `base_url`
  and the API key.
- Clients address **model aliases** (`chat-default`, `chat-economy`, ...), never vendor
  model names. The alias → target mapping is configuration, so the platform team can
  re-point traffic without code changes.
- Unknown request fields (`tools`, `response_format`, `seed`, ...) are kept and
  forwarded verbatim, so new vendor features work without a gateway release.
- A single **`Provider` port** with two adapters:
  - `openai`: any OpenAI-compatible endpoint (configurable base URL, auth header
    `Authorization: Bearer` or `api-key`, extra headers). Streaming always requests usage
    upstream so accounting works even when the client does not ask for it.
  - `mock`: a deterministic in-process provider (echo, failure and latency injection,
    lexical embeddings) used by tests, evals, load tests and the zero-config demo.

## Consequences

- Positive: drop-in adoption, so central governance becomes the default path rather than an
  opt-in.
- Positive: vendor neutrality. Switching or adding a vendor is a config change, and fallback
  across vendors is free.
- Negative: features without an OpenAI-compatible form (some vendor-specific batch or
  realtime APIs) are out of scope for v1. A native adapter can implement the same port
  later.
- Negative: the mock echoes prompts. It is never wired unless configured, and the
  production reference config only defines `openai` providers.

## Alternatives considered

- **A proprietary gateway API**: full control, but every client must be rewritten.
- **Per-vendor native SDK adapters**: richer features, a larger attack surface and many
  more dependencies. Most vendors and inference servers now offer an
  OpenAI-compatible endpoint anyway.
