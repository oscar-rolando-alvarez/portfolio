# ADR 0006: Observability with GenAI semantic conventions and evals as a CI gate

- Status: Accepted
- Date: 2026-10-17

## Context

Platform, security and finance teams each need different views of the same traffic:
latency and error budgets, an audit trail without sensitive content, and spend by tenant
and model. Changes to routing, guardrails or the cache can silently degrade
correctness, for example a lower semantic threshold that starts serving wrong answers.

## Decision

- **Traces**: OpenTelemetry with OTLP/HTTP export. The server span comes from `otelhttp`;
  each provider attempt is a client span named `chat {model}` or `embeddings {model}` with
  GenAI semantic-convention attributes (`gen_ai.operation.name`, `gen_ai.provider.name`,
  `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`,
  `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`, ...) plus `llmgw.*`
  attributes (tenant, cache result, fallbacks, cost). Outbound HTTP propagates W3C
  trace context. Prompt and completion content is never recorded.
- **Metrics**: Prometheus counters and histograms (`llmgw_*`) for requests, end-to-end
  and upstream latency, TTFT, tokens, cost, cache results and savings, fallbacks, hedges,
  breaker state, guardrail events, rate-limit and budget events. Labels are bounded
  (tenant, alias, target), never user input.
- **Audit**: one JSON line per request through a dedicated `slog` handler, with request ID,
  trace ID, tenant, key ID, alias, provider, status, tokens, cost, cache result, attempts and
  fallbacks, PII finding *counts*, injection score and rules, and the SHA-256 of the redacted
  prompt. It is suitable for shipping to a SIEM.
- **Evals**: `cmd/evals` drives the real HTTP stack in-process against a golden dataset
  (routing, weighted split, fallback, PII, injection, cache, governance) and fails CI when any
  threshold is breached. The same harness can target a running gateway (`-base-url`) or a
  real provider config (`evals/config.real.yaml`) to calibrate the semantic threshold.

## Consequences

- Positive: an SRE, a CISO and a FinOps analyst can each answer their questions from
  standard tools (Jaeger/Tempo, Prometheus/Grafana, SIEM) without reading prompts.
- Positive: regressions in safety or cache correctness are caught at PR time, not in
  production. The harness already caught three PII false positives during development.
- Negative: a tenant label on metrics grows cardinality with the number of tenants. That is
  fine at hundreds of tenants; beyond that, aggregate in the warehouse.
- Negative: deterministic mocks validate gateway logic, not model quality. Model-quality evals
  belong to the consuming applications.

## Alternatives considered

- **Logging prompts for debugging**: rejected for privacy reasons. Use the prompt hash plus
  application-side logs.
- **Vendor-specific LLM observability SaaS**: quick to adopt, but it adds a data processor
  and lock-in. OTLP keeps the backend swappable.
