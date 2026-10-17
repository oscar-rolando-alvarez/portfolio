# ADR 0007 - A first-class, versioned cost model

- Status: accepted
- Date: 2026-10-17

## Context
Buyers (telcos, utilities, logistics operators) ask one question before any architecture discussion: what will
this cost at *my* scale? IoT costs are dominated by per-message ingest pricing and grow non-linearly with
reporting frequency; LLM costs depend on incident rate and model choice. Spreadsheet estimates drift from the
architecture they describe.

## Decision
- The estimator is code (`fleetintel.cost`): a pure function from a validated `FleetProfile` (devices,
  interval, payload, batching, compression, edge filtering, incident rate, LLM share/tiering/caching, tokens,
  retention, API traffic) to line items for IoT Core, MSK Serverless, Lambda (requests + GB-s, arm64),
  SQS (including long-poll baseline), DynamoDB on-demand (including detector-state writes), API Gateway,
  CloudWatch Logs, X-Ray, data transfer, KMS and LLM/embedding tokens.
- Unit prices live in a **versioned, dated YAML table** with sources, explicitly labelled as assumptions.
- `Decimal` arithmetic; tests assert **exact** hand-computed numbers for a minimal profile.
- Recommendations are computed, not written: each lever (edge batching, compression, report-by-exception,
  LLM caching, model tiering, larger stream batches, log trimming) re-runs the model and reports the delta.
- Exposed as a library, a CLI (`fleetintel-cost`) and an API endpoint; the README sample report is generated
  and CI fails if it drifts from the pricing table.

## Consequences
- Cost is part of design reviews: e.g. the model shows IoT Core messaging is ~88% of cost at 1M devices with
  5-minute reporting and that edge batching cuts the bill by more than half.
- Prices must be refreshed (new dated file); old estimates remain reproducible.
- Simplifications (no free tier, no tiering beyond IoT messaging, no discounts) are documented.

## Alternatives considered
- AWS Pricing Calculator exports: authoritative unit prices but not programmable or testable.
- Live AWS Price List API: accurate but adds network dependency and complexity to CI; a dated snapshot is
  more reproducible.
