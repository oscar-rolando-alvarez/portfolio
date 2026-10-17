# ADR 0008 - Real-time path: a stateful gateway pushing pre-aggregated frames over SSE

- Status: accepted
- Date: 2026-10-17

## Context
Operators and executives want to *see* the fleet react: throughput, availability, radio quality, which cells
are degrading, and confirmed incidents with their AI diagnosis, within seconds. The raw telemetry stream is far
too large for browsers (1M devices at 5-minute reporting is ~3,300 events/s; the simulator reaches millions per
second), and the platform's detection pipeline is batch-per-window by design (ADR 0004) with incidents persisted
in DynamoDB. The data flow to the browser is one-directional; the only browser-to-server actions (approving a
remediation) are ordinary requests.

## Decision
- A small **live gateway** (Go, `gateway/`) consumes the telemetry topic directly (every partition, no consumer
  group, starting at the log end) and aggregates **per wall-clock second per tenant**: events/s, devices online,
  availability, RSRP/SINR histograms, RAT mix, per-cell health, top degraded cells/firmware/visited
  networks/APNs, and EWMA z-score **anomaly scores** per scope (learning only from normal behaviour). It also
  follows confirmed incidents and their EN/ES diagnoses through the platform's tenant-scoped API and records how
  long the live signal preceded the confirmed incident.
- Frames are pushed with **Server-Sent Events**. Each frame is serialised **once per tenant per second** and fanned
  out; every client has a bounded queue (drop-oldest, latest-wins) and is disconnected after repeated overflow.
  EventSource reconnects automatically and the `hello` frame (15 min of compact history, latest snapshot, cell
  frame, recent incidents) resynchronises state, so dropping is always safe. Clients can downsample further
  (`?every=N`, `?cells=0`). Ingest downsampling caps the events per second that feed distributions.
- The browser never talks to the gateway directly: the dashboard's same-origin `/api/stream` route proxies SSE
  and attaches the tenant API key server-side. The gateway accepts only SHA-256-hashed keys bound to one tenant.
- In AWS the gateway is an **ECS Fargate service** (MSK IAM read-only, private subnets, Cloud Map DNS) and the
  dashboard sits behind an ALB with a long idle timeout (`infra/terraform/realtime.tf`).

## Consequences
- Browser load is independent of fleet size: ~2-3 KB per second per client plus a columnar cell frame every 2 s
  (~30-80 KB for 1-2k active cells; it scales with cells, not devices).
- Live anomaly scores are an *early signal*, not the incident of record; the platform's windowed detector,
  enrichment, guardrailed diagnosis and idempotent persistence stay the source of truth.
- The gateway holds per-device last-seen state in memory (O(devices) - ~100 B/device); very large tenants should
  shard by tenant or partition range, or move presence to a bitmap per cell.
- Each replica reads every partition (fan-out reads); MSK egress grows with replicas, which is fine for a few
  replicas and is reflected in the reference deployment (2 tasks).
- Polling the incident API every 2 s is simple and reuses its authz model; at higher incident volumes switch to
  DynamoDB Streams -> EventBridge Pipes -> gateway push.

## Alternatives considered
- **WebSockets (API Gateway WebSocket API)**: bidirectional, but the traffic is one-way; it adds connection
  bookkeeping (DynamoDB connection table, `@connections` fan-out per message) and per-message pricing that
  multiplies with clients. SSE works over plain HTTP/2, proxies and ALBs, and reconnects natively.
- **AWS AppSync Events**: managed pub/sub with WebSocket delivery and good fan-out; a strong option when clients
  number in the thousands. We would still need the aggregation service; AppSync would replace only the hub. The
  gateway's hub is behind a small interface so this swap is contained.
- **Browser subscribes to raw telemetry (e.g. MQTT over WebSockets)**: impossible to scale and leaks
  device-level data to the client.
- **Aggregate in the Lambda stream processor and push from there**: couples the latency-sensitive view to the
  batch windowing of detection and to Lambda invocation lifetimes.
