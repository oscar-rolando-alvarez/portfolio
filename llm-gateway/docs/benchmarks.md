# Performance results

All numbers below come from one local run on **2026-10-17**: an Apple M3 Pro laptop
(11 cores) running Docker Desktop (8 GB VM), with several other heavy workloads active
(load average around 18 to 24). Treat them as conservative and reproducible, not as a
tuned benchmark. The model is the built-in mock provider with **25 ms simulated latency**,
so every millisecond above that is gateway, network or Redis time.

## Load test (k6 1.8.2)

Script: [`loadtest/k6.js`](../loadtest/k6.js). It has three back-to-back constant-arrival-rate
scenarios of 30 s each:

| Scenario | What it measures |
|---|---|
| `cache_hit` | Identical prompt. Full pipeline: auth, injection scoring, PII scan, budget check, two token buckets, exact-cache hit, usage accounting, audit log. |
| `upstream` | `Cache-Control: no-cache`, routed to the mock provider (25 ms). Adds routing, provider call, cost accounting and token reconciliation. |
| `streaming` | SSE through the mock provider (about 20 chunks at 5 ms each, roughly 85 ms of model time). |

### Run A: full Docker Compose stack (gateway + Redis + Jaeger + Prometheus), audit log to stdout

`docker compose up -d` then `RATE=400` (cache_hit at 800 rps, upstream at 400 rps, streaming at 100 rps), with k6 in the compose network.

| Scenario | Target rate | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| cache_hit | 800 rps | 0.65 ms | **2.07 ms** | 7.24 ms | 0 |
| upstream (25 ms model) | 400 rps | 26.2 ms | **27.31 ms** | 28.72 ms | 0 |
| streaming | 100 rps | 88.8 ms | 92.96 ms | 101.1 ms | 0 |

Gateway overhead on the upstream path (response time minus 25 ms): **p50 1.2 ms, p95 2.3 ms**.
39,004 requests, 0 failures, all k6 thresholds passed.

### Run B: native binary + Redis on the host, audit log discarded, k6 in Docker

`RATE=1000` (cache_hit at 2,000 rps, upstream at 1,000 rps, streaming at 250 rps).

| Scenario | Target rate | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| cache_hit | 2,000 rps | 2.38 ms | **17.9 ms** | 68.4 ms | 0 |
| upstream (25 ms model) | 1,000 rps | 27.3 ms | **38.8 ms** | 66.3 ms | 0 |
| streaming | 250 rps | 85.4 ms | 114.2 ms | 143.5 ms | 0 |

97,136 requests, 0 failures, 366 iterations dropped (0.4%) by the k6 executor. All thresholds passed.

### Saturation

At `RATE=2000` inside Docker Desktop (4,000 rps target for cache hits), throughput levels
off at about **1,200 rps for the whole stack**. That stack is the gateway, Redis, Jaeger,
Prometheus and the k6 load generator, all sharing the same VM CPUs. Requests still did not
fail (0 errors), but p95 rose to about 330 ms. Each request makes about six Redis round trips
(two buckets, budget read, cache get, usage pipeline, reconciliation) plus two log lines.
These are the first things to optimise; see the roadmap in the README.

Capacity-planning assumption for production: about 1,000 rps per vCPU-pair replica at p95
under 5 ms of overhead, scaled horizontally by the HPA. **This is an estimate to validate on
the target infrastructure.**

## Micro-benchmarks (`go test -bench . -benchmem ./internal/...`)

| Benchmark | Result | Notes |
|---|---|---|
| `ChatCompletionUpstream` (full HTTP handler, zero-latency mock, in-memory stores) | ~35 µs/op, 139 allocs | end-to-end pipeline cost without network |
| `ChatCompletionCacheHit` | ~34 µs/op, 136 allocs | |
| `ExactLookupHit` | ~6.5 µs/op | canonical hash + KV get + JSON decode |
| `SemanticSearch1kx256` | ~125 µs/op, 0 allocs | brute-force cosine, 1k vectors × 256 dims |
| `SemanticSearch10kx256` | ~1.26 ms/op | the point to switch to an ANN index |
| `SemanticSearch1kx1536` | ~0.82 ms/op | OpenAI-size embeddings |
| `Redact` (PII-dense ~1 KB) | ~146 µs/op | 32 entities found and validated |
| `RedactClean` (~1 KB, no PII) | ~2.6 µs/op, 0 allocs (373 MB/s) | prefilters skip regexes |
| `ScoreInjection` (~1 KB benign) | ~66 µs/op | anchor pre-checks cut this from 261 µs |
| `RateLimiterParallel` (in-memory) | ~100 ns/op | sharded token buckets |
| `PlanCost` | ~0.6 µs/op | cost-aware ordering of 3 targets |

## Reproduce

```bash
# Compose run (A)
docker compose up -d --build
docker run --rm --network llm-gateway_default -e BASE_URL=http://gateway:8080 -e RATE=400 \
  -v "$PWD/loadtest:/scripts" grafana/k6:1.8.2 run /scripts/k6.js

# Micro-benchmarks
go test -run '^$' -bench . -benchmem ./internal/...
```
