# ADR 0001: Go with a hexagonal (ports and adapters) architecture

- Status: Accepted
- Date: 2026-10-17

## Context

The gateway sits on the hot path of every model call in the enterprise. It must add
very little latency (target: p95 under 5 ms of overhead before the upstream call),
cope with thousands of concurrent long-lived SSE streams, start in well under a second
so the HPA can scale it, and be easy to audit. Upstream providers, state stores
and telemetry backends will change over the product's life: new model vendors,
self-hosted inference, Redis vs Valkey, a vector database for the cache.

## Decision

- Implement in **Go** (1.27) on the standard library `net/http` with the small
  `chi` router, `log/slog` for structured logs, the OpenTelemetry SDK and
  `prometheus/client_golang`. No web framework.
- Use a **hexagonal layout**:
  - `internal/core` holds the domain model (OpenAI wire types, usage, errors) and the
    **ports**: `Provider`, `RateLimiter`, `UsageStore`, `KV`, `Embedder`.
  - Domain services (`routing`, `governance`, `guardrails`, `cache`) depend only on
    ports.
  - `internal/app` is the use-case layer: it runs the pipeline
    (auth → guardrails → budget → rate limit → cache → route → account → audit).
  - Adapters live under `internal/adapters` (OpenAI-compatible HTTP, mock, Redis,
    in-memory) and `internal/httpapi` (inbound HTTP).
  - `internal/bootstrap` is the single composition root, shared by the binary, the
    end-to-end tests and the eval harness.

## Consequences

- Positive: one static ~15 MB binary in a distroless image, ~40 MB in total; goroutine-per-stream
  concurrency; the race detector runs over the whole suite; adapters are
  swapped without touching domain code (the test suite runs the same pipeline on
  in-memory stores, miniredis and real Redis).
- Positive: the eval harness and the e2e tests drive the *real* HTTP stack, not
  mocks of it.
- Negative: Go has fewer ready-made LLM SDKs than Python. That does not matter here:
  the gateway speaks the wire protocol and never needs an SDK.
- Negative: keeping interfaces at the consumer side means a little more
  boilerplate than calling Redis directly.

## Alternatives considered

- **Python (FastAPI/LiteLLM-style)**: richer ecosystem, but higher per-request overhead
  and the GIL make it a weaker fit for a latency-critical proxy with many streams.
- **Envoy/WASM filter**: excellent data plane, but tenant budgets, semantic caching and
  provider fallback need custom stateful logic that is awkward to write in filters. An
  Envoy front proxy can still sit in front of this gateway for TLS and WAF.
- **Rust**: similar performance, slower to change and a smaller hiring pool for most
  enterprise platform teams.
