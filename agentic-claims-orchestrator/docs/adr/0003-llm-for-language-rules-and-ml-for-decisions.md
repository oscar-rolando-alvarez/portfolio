# ADR-0003: LLMs handle language; rules, classical ML and humans make decisions

- Status: Accepted
- Date: 2026-10-17

## Context

Claims outcomes have financial and legal consequences, must be consistent across similar cases, and must be explainable to claimants and regulators. LLMs are excellent at reading messy text and writing explanations, but are non-deterministic, vulnerable to prompt injection and hard to audit as decision makers.

## Decision

- The LLM is used for three bounded tasks: **intake classification/summary** (structured JSON, Zod-validated), **fraud-score rationale** and the **adjuster note**. All three have deterministic fallbacks (rules/templates) used when the model fails or returns invalid output, and severity can only be *raised* by the model above an amount-based floor.
- **Coverage** and **outcome proposal** are deterministic, exhaustively unit-tested functions. **Fraud risk** comes from an offline-trained logistic regression scored in TypeScript (see the [model card](../model-card-fraud-risk.md)), whose exact per-feature contributions feed the LLM rationale.
- The **policy engine** decides whether a human must sign off; adverse outcomes always require one.
- LLM access is **provider-agnostic**: one `LlmPort` with an OpenAI-compatible Chat Completions adapter (works with OpenAI, Azure OpenAI v1, vLLM, Ollama, LiteLLM) selected by environment variables, and a **deterministic fake** for tests, evals and offline demos.

## Consequences

- A successful prompt injection can at worst produce a misleading summary; it cannot approve a claim (proven by eval scenario S18 and the `HITL-PROMPT-INJECTION` rule).
- The system keeps working (degraded explanations) during LLM outages; outcomes are unaffected.
- Model upgrades are low risk: evals measure routing/outcome accuracy, which do not depend on the model, while explanation quality is reviewed separately.
- Trade-off: we do not exploit LLM judgement for edge-case coverage interpretation. That is a roadmap item, as *advice to the adjuster*, not as a decision.

## Alternatives considered

- **LLM-as-decider with tool calling**: higher automation ceiling, much weaker auditability and consistency; rejected for a regulated decision.
- **Gradient boosting for fraud**: likely better AUC on real data; rejected for v1 to keep exact explanations without shipping SHAP tooling. The `FraudModel` interface allows swapping.
