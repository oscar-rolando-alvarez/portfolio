# ADR 0004: Multi-tenant governance state in Redis, failing open

- Status: Accepted
- Date: 2026-10-17

## Context

Rate limits, monthly budgets, idempotency keys and the exact response cache must be
consistent across all gateway replicas. They sit on the hot path, so every extra
millisecond and every new dependency matters. Finance needs a monthly per-tenant
view of tokens and spend.

## Decision

- **Virtual API keys** map to tenants. The config stores only the SHA-256 of each key,
  generated with `gateway -hash-key`. Admin endpoints use a separate admin key, compared in
  constant time.
- **Rate limits** are token buckets for requests/min and tokens/min, implemented as one
  atomic Lua script per bucket. The script reads time from the Redis server (`TIME`) so
  replicas with skewed clocks agree. The token bucket is charged with a pre-flight estimate
  and **reconciled** with the provider-reported usage afterwards (forced take, which may go
  negative).
- **Budgets** are monthly per-tenant counters in a Redis hash (tokens, nano-USD cost,
  requests, cache hits, per-model breakdown) written in a single `MULTI` pipeline.
  `hard` budgets reject with `429 insufficient_quota`; `soft` budgets add
  `X-Gateway-Budget-Warning`. Costs are integers (nano-USD) to avoid float drift.
- **Fail open**: if Redis is unavailable, rate-limit and budget checks are skipped with a
  warning log. Model traffic keeps flowing; governance degrades. `/readyz` still reports
  the dependency so operators are alerted.
- With no `redis.url`, in-memory adapters are used (single replica, tests, demo).

## Consequences

- Positive: a few sub-millisecond round trips per request, and horizontally scalable stateless
  pods.
- Positive: the usage report (`/admin/v1/usage`) reads the same counters the budget check uses,
  so FinOps numbers and enforcement cannot disagree.
- Negative: budgets are checked before the call, so concurrent in-flight requests can overshoot
  a hard budget by at most their own cost. A reservation protocol would close this gap at
  the price of an extra write per request.
- Negative: failing open means a Redis outage briefly lifts limits. Tenants that need
  fail-closed behaviour (regulated quotas) are a roadmap item (`governance.fail_mode`).

## Alternatives considered

- **Local-only limiters**: per-pod limits multiply with the replica count and break under HPA.
- **A relational database**: durable and queryable, but too slow for per-request checks. The
  roadmap exports monthly counters to the warehouse for chargeback instead.
- **Sliding-window logs**: exact, but O(requests) memory per tenant. Token buckets give
  burst tolerance in O(1).
