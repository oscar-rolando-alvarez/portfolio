# ADR 0006 - LLM diagnosis: provider-agnostic client, RAG over runbooks, structured output, guardrails

- Status: accepted
- Date: 2026-10-17

## Context
The value of the platform is turning an anomaly into an *actionable* diagnosis: root cause, evidence,
remediation steps, whether to dispatch a truck, and a customer message. LLMs are good at this synthesis but
can hallucinate identifiers, over-claim confidence, recommend expensive actions or leak internal data, and
providers change frequently.

## Decision
- **Provider-agnostic**: one OpenAI-compatible HTTP client (`/chat/completions`, `/embeddings`) configured by
  base URL, key and model - works with OpenAI, Azure OpenAI, vLLM, Ollama or a LiteLLM gateway. A
  deterministic fake model and hashing embeddings make CI, evals and demos fully offline.
- **RAG**: a versioned runbook corpus (8 runbooks, chunked by section) indexed in memory with embeddings plus a
  metadata boost on the suspected fault class (hybrid retrieval); at most two sections per runbook.
- **Structured output**: the Pydantic `Diagnosis` schema is sent as `response_format: json_schema` (falls back
  to JSON mode when unsupported) and validated; one repair round-trip on schema violations.
- **Guardrails** (deterministic code, not prompts): device/runbook ids must come from the evidence/retrieval
  (hallucinations stripped and redacted), confidence below threshold or `insufficient_evidence` -> refused ->
  `NEEDS_REVIEW`, truck rolls overridden for remotely-fixable causes, identifiers/IMSIs redacted from customer
  text, instruction-like strings in untrusted evidence flagged. A **pre-check** refuses weak incidents
  without calling the model (cost control).
- **Observability**: every call is an OpenTelemetry span with GenAI semantic conventions
  (`gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.*`); token counts
  are CloudWatch metrics and feed the cost model.

## Consequences
- Swapping providers is configuration; evals run unchanged against a real model.
- The fake model encodes the expert decision list from the system prompt - it validates the pipeline and the
  gate, not model quality; real-model evals are documented and reported with the same metrics.
- Guardrails can refuse correct-but-unsupported diagnoses; refusals are visible (status, metric, alarm).

## Alternatives considered
- Provider SDKs / agent frameworks: more features, more lock-in and dependency weight in Lambda.
- Fine-tuned classifier only: cheaper but cannot write remediation and customer messages grounded in runbooks.
