# ADR-0004: Declarative, versioned guardrail policy with human-in-the-loop approvals

- Status: Accepted
- Date: 2026-10-17

## Context

Thresholds such as "payouts above 10,000 USD need a senior adjuster" belong to Claims Operations and Compliance, change more often than code, and must be provable after the fact ("which rule version paused this claim?").

## Decision

- Guardrails live in [`config/claims-policy.json`](../../config/claims-policy.json), validated by a Zod schema at startup (fail fast). Three sections:
  - `rules`: conditions over the typed claim state (`all`/`any`/`not`, comparisons against literals or other fields) with effect `require_approval` (with a role) or `block` (hard invariant), scoped to a graph **stage**.
  - `dataPolicies`: data classifications, the tools allowed to produce them and the sinks they may never reach (LLM, audit, logs, API).
  - `toolGrants`: least-privilege tool allow-list per step.
- The `PolicyEngine` is pure and deterministic. When several approval rules match, the highest-authority role in `approvalRolePriority` is required. Every evaluation with matches is recorded (`policy.evaluated` with policy id + version), and each approval stores the triggering rule ids.
- Human-in-the-loop: `require_approval` durably pauses the run (`awaiting_approval`) and creates an approval request. `POST /v1/claims/{id}/approvals/{approvalId}` accepts `approve` or `override` (override requires a justification and is re-checked by `BLOCK-FINAL-*` invariants, so humans cannot exceed coverage limits either). RBAC requires the exact role and a **four-eyes** check prevents the submitter from approving.

## Consequences

- Business owners can review the policy as data; the CI eval gate shows the impact of a threshold change before merge.
- Invariants are enforced twice (decision stage and finalize stage) so even a bug in an agent or a human override cannot pay above the limit or pay an uncovered claim.
- The expression language is intentionally small; complex logic stays in tested code.

## Alternatives considered

- **OPA/Rego or Cedar**: more expressive and standard; adds a policy runtime and a language reviewers must learn. The `Gate<S>` port allows plugging OPA later without touching the runtime.
- **Hard-coded thresholds**: fastest to write, impossible to audit or change safely.
