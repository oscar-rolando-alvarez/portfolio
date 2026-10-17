# ADR 0004: Provider-agnostic model ports with deterministic offline fakes

- Status: Accepted
- Date: 2026-10-17

## Context

Enterprises standardise on different model providers (public APIs, Azure OpenAI, private
vLLM/Ollama clusters behind a LiteLLM gateway) and change them over time for cost,
residency or quality reasons. At the same time CI must be fast, free, deterministic and
must never need an API key.

## Decision

- Hexagonal architecture: `EmbeddingProvider`, `LLMProvider`, `Reranker`, `QueryRewriter`
  are protocols in `domain/ports.py`; the application never imports a vendor SDK.
- One HTTP adapter for the **OpenAI-compatible** wire protocol (`/chat/completions` with
  SSE streaming and usage, `/embeddings` with `dimensions`), configured only by base URL,
  API key and model name, with retries (exponential backoff + jitter on 429/5xx/timeouts).
- Deterministic fakes: a feature-hashing embedder and an *extractive* chat model that
  quotes and cites the best-matching source sentences or returns the refusal sentinel.
  The whole test suite, the eval gate and the demo run offline with them.

## Consequences

- Switching providers is a configuration change; evals can be rerun against the real
  model with the same harness (`RAG_LLM_PROVIDER=openai ragplatform evaluate --judge llm`).
- Offline evals measure the *system* (chunking, retrieval, ACLs, guardrails, refusal,
  citation validation), not model quality; model quality is measured by the LLM-judge
  path against a configured model.
- Provider-specific features (tool calling, JSON mode, prompt caching) need adapter
  extensions; the port is intentionally minimal.

## Alternatives considered

- **Framework abstraction (LangChain / LlamaIndex)**: fast to start, but large dependency
  surface and leaky abstractions around streaming/usage/tracing; the needed surface here is
  two HTTP calls.
- **Mocking HTTP in tests only**: catches wiring bugs but cannot drive meaningful
  end-to-end evals.
