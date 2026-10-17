# ADR-0001: Own a small durable orchestration runtime instead of adopting an agent framework

- Status: Accepted
- Date: 2026-10-17

## Context

Claims triage is a long-running, regulated workflow: it calls external systems, can pause for days waiting for a human, must survive deploys and crashes, and every transition must be explainable to an auditor. Agent frameworks optimize for prompt/tool loops; workflow engines optimize for durability. We need both, plus first-class guardrails (policy gate, budgets, least-privilege tools) that sit *inside* the execution loop rather than around it.

## Decision

Implement a compact runtime (`packages/core/src/runtime`, ~600 LOC) with:

- An **explicit graph** (`Graph<S>`): named steps, a static/conditional transition table validated at construction, typed state `S`.
- **Durable checkpoints**: after every step, one transaction writes the run row (optimistic `version`), a checkpoint, the audit events and any approval request (`RunStore.commitStep`).
- **Leases** for single-writer execution and **recovery** of runs whose worker died (`listRecoverable` + `recover()` at startup and on an interval).
- **Retries** with exponential backoff and full jitter, driven by an error taxonomy (`TransientError` vs `DomainError`), plus **per-step timeouts** via `AbortSignal`.
- **Budgets** (iterations, LLM tokens, cost, tool calls, wall clock) checked before each step and before each LLM/tool call.
- **Idempotency** at three levels: run creation (`tenant + Idempotency-Key`), tool calls (derived key propagated in MCP `_meta`) and approval decisions (replay-safe).
- A **policy gate** evaluated after every step that can allow, pause for approval, or block.

## Consequences

- Positive: every guarantee is visible, tested (crash-recovery, lease contention, budget, timeout tests) and portable across stores (in-memory and PostgreSQL implement the same port). No framework lock-in, no hidden state, deterministic tests.
- Negative: we own the code. Features such as timers/cron, child workflows or visual tooling are not included.
- Steps must be idempotent or tolerate re-execution of the in-flight step after a crash (true here: reads + deterministic transforms; side effects belong in `finalize` keyed by the run id).

## Alternatives considered

- **LangGraph (JS)**: good graph ergonomics and checkpointers, but guardrails/budgets would be bolted around it and its persistence model is less explicit about audit atomicity.
- **Temporal / Restate**: excellent durability, but adds a cluster to operate and pushes policy/audit concerns into activity code. A good migration target if workflows grow (the `StepDefinition` contract maps 1:1 to activities).
- **Plain queue + workers**: durable but no typed graph, no pause/resume semantics without reinventing this runtime.
