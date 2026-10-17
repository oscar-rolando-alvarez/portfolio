# ADR 0003: Routing policies, circuit breakers, retries and hedging

- Status: Accepted
- Date: 2026-10-17

## Context

LLM providers have frequent partial outages, regional capacity limits (429) and
long-tail latency. Model prices for comparable quality differ by more than 10x.
The gateway must keep traffic flowing and let the platform team trade cost for
latency per use case.

## Decision

- Each alias has an ordered list of targets and a **policy**:
  `priority` (config order), `weighted` (random canary or A/B split), `cost` (sort by
  estimated request cost from the prompt estimate and `max_tokens`), `latency` (sort by
  EWMA latency, unknown targets first so they get explored).
- The plan is the **fallback chain**. Targets whose **circuit breaker** is open are moved
  to the end. Breakers trip after N consecutive retryable failures, cool down, then admit
  a single half-open probe. Breaker and latency state lives in a registry that survives
  config hot reloads.
- **Retries** per target use full-jitter exponential backoff and honour `Retry-After` when it
  fits within the backoff cap. Only retryable errors (timeouts, 429, 5xx, connection
  errors) are retried or failed over. A 400 from an upstream is returned right away and
  does not count against the target's health. Client cancellation stops everything and also
  does not count.
- Each attempt has its own **timeout**, enforced through context cancellation. For streams the
  timeout only bounds time-to-first-chunk: the router reads the first chunk *inside*
  the routed call, so a stream that fails before its first byte still fails over, and
  once bytes reach the client the target is committed.
- Optional **hedging** (per alias, non-streaming): if the primary has not answered after
  `hedge.delay`, race the next healthy target. The first success wins and the loser's
  context is cancelled.

## Consequences

- Positive: provider incidents become a latency blip plus a `llmgw_fallbacks_total`
  increment instead of an outage. The eval suite asserts retry, timeout, no-failover-on-400
  and all-targets-down behaviour on every PR.
- Positive: cost-aware routing makes "cheapest model that meets the SLA" a config line.
- Negative: hedging can double spend on slow requests. It is off by default and should be
  enabled only where tail latency is worth paying for, with a delay near the target's p95.
- Negative: breakers are per replica. That is deliberate (no cross-replica chatter), but
  each replica learns about an outage separately, which costs a few failed calls per pod.
- Negative: once streaming output has started, a mid-stream upstream failure cannot be
  retried transparently. The client receives an SSE error event.

## Alternatives considered

- **Service mesh retries (Istio/Linkerd)**: these do not understand which LLM errors are
  retryable, cannot fail over to a different vendor with a different model name, and cannot
  account cost.
- **Shared breaker state in Redis**: faster convergence, but it adds a hot-path dependency
  and new failure modes. Per-replica state plus a fast cool-down is simpler.
