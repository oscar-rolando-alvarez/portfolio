# ADR 0009 - Dashboard: deterministic demo mode, one data contract, bilingual end to end

- Status: accepted
- Date: 2026-10-17

## Context
The dashboard has two audiences: an operator watching a live fleet, and a buyer or hiring manager who opens a
link without any backend. Both must see the same product. The target markets (telcos, utilities and logistics
operators in the Americas) work in English and Spanish, including customer-facing messages, and quote costs in
USD and COP. Screenshots and end-to-end tests must be reproducible.

## Decision
- **One data contract, two sources.** The UI consumes only the gateway's frames (`hello`, `snapshot`, `cells`,
  `incident`) through a pure reducer. In *live* mode they come from SSE; in *demo* mode from an in-browser
  generator that emits the same shapes. The header always shows which one is active; live is offered only when the
  server reports a configured gateway.
- **Demo mode is deterministic**: every frame is a pure function of (tenant, scenario second). The fleet mirrors
  the simulator's catalogue (profiles, intervals, RATs, PLMNs, firmware builds, cell-id format) and a 20-minute
  loop replays its fault types: a cell outage spreading across one tracking area, congestion, a firmware
  regression, a roaming misconfiguration and an APN error. Incidents carry the same bilingual diagnoses the
  platform's fake model produces. Faults are spaced so the fleet is healthy most of the loop, and month-to-date KPIs (availability SLA, MTTR) start from a per-tenant seed labelled "demo baseline" in the UI, so a single injected outage reads like it would in production: a visible dip in the recent window, a small move in the monthly figure. `?demoAt=<second>` pins any moment for tests, screenshots and demos.
- **Cell positions** come from one portable hash (FNV-1a + murmur3 finalizer) implemented in Python (enrichment
  fixture) and TypeScript (map), with shared golden vectors, so the map and incident enrichment agree.
- **Cost numbers** come from a TypeScript port of the estimator, tested to the cent against a golden file that
  the Python estimator generates in CI (no drift possible).
- **Bilingual end to end**: the diagnosis prompt requests `translations` for the extra locale in the *same* LLM
  call; guardrails apply to every language; the API serves `?locale=` / `Accept-Language`; the eval gate checks
  localization coverage. The UI uses next-intl with `/en` and `/es` routes, the choice persisted in a cookie, all
  numbers/dates/currency via `Intl`, COP via an explicit, editable exchange-rate assumption. A unit test fails if
  the EN and ES catalogs differ in keys or ICU placeholders, or if code references a missing key.

## Consequences
- The dashboard can be hosted anywhere (container, or later static hosting) and demoed offline; CI exercises
  every screen in both locales without a backend, with axe accessibility checks.
- Demo numbers are illustrative and labelled as such; the value model's inputs are editable assumptions, not
  measured results.
- Two TypeScript ports (cost model, geolocation) must stay in sync - enforced by golden tests, not by discipline.
- One-call translation roughly doubles the free-text part of the output tokens (enums, ids and owners are not
  repeated); output tokens are a small share of the LLM bill, which is itself ~1.5% of the platform cost at 1M
  devices (ADR 0007). It keeps a single, consistent
  diagnosis per incident; machine-translating after the fact would decouple the languages from the guardrails.

## Alternatives considered
- Recorded fixture playback (JSONL of real gateway frames): realistic but large, hard to make interactive
  (tenants, replay) and opaque to review.
- A mock backend container for demos: still requires infrastructure to show the product.
- Translating diagnoses in the UI or with a separate translation API: cheaper per call but ungoverned by the
  guardrails and inconsistent with the customer-facing message the platform would actually send.
