# Agentic Claims Orchestrator

![CI](https://github.com/oscar-rolando-alvarez/portfolio/actions/workflows/agentic-claims-orchestrator.yml/badge.svg)

**A governed multi-agent system that automates insurance claims intake and triage — FNOL intake, document extraction, coverage check, fraud-risk scoring and routing — while keeping humans in control of every high-impact decision and producing a tamper-evident audit trail.**

## Executive summary

Claims handling is the largest operating cost line of a P&C insurer after the losses themselves, and first-notice-of-loss (FNOL) triage is still mostly manual: an adjuster reads the report and documents, looks up the policy, checks history, and decides who should handle the claim. This project automates that triage with a durable agent graph (Intake → Extraction → Coverage → FraudRisk → Decision) that calls enterprise systems through **MCP tool servers**, scores fraud with a **transparent ML model**, uses an **LLM only for language tasks**, and routes every adverse or high-value outcome to the right human through a **declarative guardrail policy**. Buyers are heads of claims / COOs and CIOs at P&C carriers, MGAs and TPAs who need straight-through processing without giving up regulatory control.

Value hypotheses (**estimates and assumptions, not measured results**):

| Hypothesis | Assumption behind it |
|---|---|
| 25-40% of FNOLs (simple, covered, low-risk, documented) settle straight-through in minutes instead of 1-3 days | The golden eval set routes 25% straight-through under deliberately conservative rules; real mixes skew to small auto/glass claims |
| 15-25 minutes of adjuster time saved per triaged claim | Policy lookup, history check, document reading and note drafting are automated; adjusters review a pre-assembled file |
| Fraud leakage reduced by surfacing high-risk claims to SIU at intake | Synthetic model: precision 0.80 at the SIU threshold with a 1.1% referral rate (see [model card](docs/model-card-fraud-risk.md)) |
| LLM cost < 0.01 USD per claim | ~510 tokens per claim measured by the eval harness (3 short LLM calls), priced at small-model list prices (configurable) |
| Audit preparation effort drops sharply | Every claim has a hash-chained, replayable record of inputs, agent steps, model/policy versions and human decisions |

## Key capabilities

- **Own orchestration runtime** (not a framework wrapper): explicit typed graph, durable checkpoints in PostgreSQL after every step, crash recovery via leases, retries with exponential backoff + jitter, per-step timeouts, idempotency keys, and hard budgets (iterations, tokens, cost, tool calls, wall clock).
- **MCP tools** built with the official MCP TypeScript SDK v2: `policy_lookup`, `claims_history`, `document_extract`, consumed through a **governed gateway** (Zod input/output validation, least-privilege grants per step, trace propagation, idempotency keys, PII tokenization). In-process or stdio transport.
- **Policy engine & human-in-the-loop**: versioned JSON rules (payout > 10k → senior adjuster, fraud ≥ 0.70 → SIU, every denial → adjuster, prompt injection → adjuster, invariants that block payouts above limits — even for human overrides). Approval API with RBAC and four-eyes check pauses and resumes runs durably.
- **Privacy by construction**: PII is tokenized at the edge (HMAC tokens, AES-256-GCM vault); only the document tool can dereference documents; DLP backstop on every LLM prompt and audit write.
- **Classical ML**: logistic-regression fraud model trained offline in Python on synthetic data, exported to JSON, scored in TypeScript with exact per-feature explanations; the LLM writes the rationale from those contributions. CI proves the artifact is reproducible.
- **Audit & observability**: append-only, hash-chained audit trail per claim with a verification endpoint; OpenTelemetry traces across agent steps, LLM calls and MCP calls (GenAI semantic conventions), metrics for tokens, latency, violations.
- **Evals as a CI gate**: 24 golden synthetic claims with expected routing/outcome/payout; measures accuracy, guardrail recall, **policy violations (must be 0)** and cost per claim with a deterministic fake LLM; same harness runs against a real model.
- **Runs anywhere**: offline CLI demo (no DB, no network, no API key), Docker Compose stack, hardened Helm chart validated in CI.

## Architecture

### C4 — System context

```mermaid
flowchart LR
  claimant["Claimant / broker portal"]
  adjuster["Adjusters, senior adjusters, SIU"]
  auditor["Internal audit / regulator"]
  system["Agentic Claims Orchestrator"]
  pas["Policy admin system"]
  dwh["Claims history warehouse"]
  idp["Document store / IDP"]
  llm["LLM endpoint (OpenAI-compatible)"]
  otel["Observability backend (OTLP)"]

  claimant -- "submits FNOL (REST)" --> system
  adjuster -- "reviews and approves (REST)" --> system
  auditor -- "reads verifiable audit trail" --> system
  system -- "MCP tools/call" --> pas
  system -- "MCP tools/call" --> dwh
  system -- "MCP tools/call" --> idp
  system -- "tokenized prompts only" --> llm
  system -- "traces and metrics" --> otel
```

### C4 — Containers

```mermaid
flowchart TB
  subgraph api["apps/server (composition root)"]
    http["HTTP API (Hono): auth, RBAC, problem+json"]
    cli["CLI: offline demo, migrate, graph"]
    evals["Eval harness and CI gate"]
  end
  subgraph core["packages/core (no I/O)"]
    svc["ClaimsService (use cases, tokenization, four-eyes)"]
    orch["Orchestrator: graph, checkpoints, leases, retries, budgets"]
    agents["Agents: Intake, Extraction, Coverage, FraudRisk, Decision, Finalize"]
    policy["PolicyEngine (versioned JSON rules)"]
    ml["FraudModel scorer (exported LR)"]
    llmport["ScopedLlm: DLP egress guard, budget, GenAI spans"]
  end
  subgraph tools["packages/mcp-tools"]
    gw["McpToolGateway (Zod in/out, grants, _meta trace + idempotency)"]
    s1["MCP server: policy-lookup"]
    s2["MCP server: claims-history"]
    s3["MCP server: document-extract (vault read access)"]
  end
  subgraph infra["packages/infra"]
    pgstore["PgRunStore + PgVaultStorage (Drizzle)"]
    oai["OpenAI-compatible LLM adapter"]
    tel["OpenTelemetry SDK + pino"]
  end
  db[("PostgreSQL: runs, checkpoints, audit_events, approvals, pii_vault")]
  llm["LLM endpoint"]

  http --> svc
  cli --> svc
  evals --> svc
  svc --> orch
  orch --> agents
  orch --> policy
  agents --> llmport
  agents --> ml
  agents --> gw
  gw --> s1
  gw --> s2
  gw --> s3
  orch --> pgstore
  pgstore --> db
  llmport --> oai
  oai --> llm
```

### Core request flow

```mermaid
sequenceDiagram
  autonumber
  participant P as Portal (claims_intake)
  participant API as HTTP API
  participant S as ClaimsService
  participant O as Orchestrator
  participant A as Agents
  participant T as MCP Gateway and Servers
  participant G as PolicyEngine
  participant DB as PostgreSQL
  participant R as Senior adjuster

  P->>API: POST /v1/claims (Idempotency-Key)
  API->>S: submit(principal, FNOL)
  S->>S: validate (Zod), tokenize PII into vault
  S->>O: start run (idempotent per tenant and key)
  O->>DB: insert run, checkpoint, run.created
  loop each step: intake, extraction, coverage, fraudRisk, decision
    O->>A: execute(state) with timeout, retries, budget
    A->>T: tools/call (validated, granted, traced)
    T-->>A: structured result, PII tokenized
    A-->>O: new state and domain events
    O->>G: evaluate(stage, state)
    O->>DB: one transaction: run v+1, checkpoint, audit events
  end
  G-->>O: require_approval (HITL-HIGH-PAYOUT, senior_adjuster)
  O->>DB: status awaiting_approval, approval request
  API-->>P: 201 claim awaiting_approval
  R->>API: POST /v1/claims/{id}/approvals/{approvalId} approve
  API->>S: decide (RBAC, four-eyes, override checks)
  S->>O: decide and resume
  O->>A: finalize
  O->>G: evaluate(finalize) invariants
  O->>DB: status completed, claim.finalized, run.completed
  API-->>R: 200 final decision
```

### Agent graph and run lifecycle

```mermaid
stateDiagram-v2
  state PolicyGate <<choice>>
  [*] --> intake
  intake --> extraction
  extraction --> coverage
  coverage --> fraudRisk: covered
  coverage --> decision: not covered
  fraudRisk --> decision
  decision --> PolicyGate
  PolicyGate --> finalize: allow
  PolicyGate --> AwaitingApproval: require_approval
  PolicyGate --> Failed: block
  AwaitingApproval --> finalize: human approve or override
  finalize --> Completed
  Completed --> [*]
  Failed --> [*]
```

Any step can also end in `Failed` (non-retryable error, exhausted retries, timeout or budget). Transient failures can be resumed by an operator (`POST /v1/claims/{id}/resume`); runs abandoned by a crashed worker are recovered automatically from their last checkpoint when the lease expires.

### Deployment (reference)

```mermaid
flowchart LR
  ing["Ingress / API gateway (OIDC)"] --> svc["Service"]
  svc --> pods["Deployment: 2-10 pods, HPA, PDB, non-root, read-only FS"]
  job["Helm pre-upgrade Job: migrations"] --> pg[("Managed PostgreSQL")]
  pods --> pg
  pods --> llmgw["LLM gateway / model endpoint"]
  pods --> col["OTel collector"]
  sec["External secret store / KMS"] -.-> pods
  cm["ConfigMap: config + guardrail policy"] -.-> pods
```

## Architecture Decision Records

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-own-durable-orchestration-runtime.md) | Own a small durable orchestration runtime instead of adopting an agent framework |
| [0002](docs/adr/0002-mcp-for-tool-integration.md) | Integrate enterprise systems as MCP servers behind a governed gateway |
| [0003](docs/adr/0003-llm-for-language-rules-and-ml-for-decisions.md) | LLMs handle language; rules, classical ML and humans make decisions |
| [0004](docs/adr/0004-declarative-policy-engine.md) | Declarative, versioned guardrail policy with human-in-the-loop approvals |
| [0005](docs/adr/0005-pii-tokenization-and-dlp.md) | Tokenize PII at the edges; resolve it only inside the PII-privileged tool |
| [0006](docs/adr/0006-postgres-checkpoints-and-hash-chained-audit.md) | PostgreSQL for checkpoints, approvals and a hash-chained, append-only audit trail |
| [0007](docs/adr/0007-typescript-on-node-type-stripping.md) | Run TypeScript directly on Node 24 LTS (type stripping), modular monorepo |

## Tech stack

| Area | Technology | Version |
|---|---|---|
| Runtime | Node.js LTS (native TypeScript type stripping) | 24.22 |
| Language | TypeScript (strict, erasable syntax only) | 6.0.3 |
| HTTP | Hono + @hono/node-server | 4.13.13 / 2.1.5 |
| Validation | Zod | 4.6.7 |
| Tools protocol | MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `client`) | 2.3.1 |
| Persistence | PostgreSQL + Drizzle ORM / drizzle-kit + node-postgres | 18.6 / 0.45.4 / 0.31.11 / 8.23.1 |
| Observability | OpenTelemetry API / SDK / OTLP exporters, pino | 1.9.1 / 2.12.0 / 0.223.0, 10.4.0 |
| LLM | Any OpenAI-compatible endpoint (OpenAI, Azure OpenAI, vLLM, Ollama, LiteLLM); deterministic fake for CI | - |
| ML (offline) | Python + scikit-learn + numpy, managed by uv | 3.13 / 1.9.1 / 2.5.4 |
| Testing & quality | Vitest, ESLint (typescript-eslint strictTypeChecked), Prettier | 5.0.5, 10.13 / 8.71.2, 3.9.10 |
| Packaging | Docker (multi-stage, pinned digest, non-root), Docker Compose, Jaeger | -, -, 2.22 |
| IaC | Helm chart (validated with `helm lint` + kubeconform) | Helm 4.3.1, kubeconform 0.8.0 |

## Quickstart

### 1. Offline demo (no Docker, no database, no API key)

```bash
cd agentic-claims-orchestrator
npm ci
npm run demo                         # S05: large house fire -> pauses for senior adjuster -> approved
npm run demo -- --scenario S13       # brand-new policy, night theft, no docs -> SIU referral
npm run demo -- --scenario S18       # prompt injection in the narrative -> flagged for review
npm run demo -- --scenario S06 --reject   # reviewer overrides the proposal with a justification
```

The demo prints every agent's output, the policy verdict, the human decision, the full hash-chained audit trail and token/cost usage.

### 2. Full stack with Docker Compose (API + PostgreSQL + Jaeger)

```bash
cd agentic-claims-orchestrator
docker compose up --build -d
curl -s localhost:8080/readyz

# submit a claim (dev keys are documented in .env.example)
curl -s -X POST 'localhost:8080/v1/claims?wait=true' \
  -H 'x-api-key: dev-intake-key-change-me' \
  -H 'idempotency-key: demo-claim-0001' \
  -H 'content-type: application/json' \
  --data @examples/fnol-collision.json | jq '{claimId, status, routing, pendingApproval}'

# approve as a senior adjuster (use the ids returned above)
curl -s -X POST localhost:8080/v1/claims/$CLAIM_ID/approvals/$APPROVAL_ID \
  -H 'x-api-key: dev-senior-key-change-me' -H 'content-type: application/json' \
  -d '{"decision":"approve","comment":"Estimate and police report verified"}' | jq '.final'

# verifiable audit trail
curl -s localhost:8080/v1/claims/$CLAIM_ID/audit -H 'x-api-key: dev-auditor-key-change-me' | jq '.verification'
```

Traces: open <http://localhost:16686> (service `agentic-claims-orchestrator`).

API summary: `POST /v1/claims`, `GET /v1/claims/{id}`, `GET /v1/claims/{id}/audit`, `GET /v1/approvals`, `POST /v1/claims/{id}/approvals/{approvalId}`, `POST /v1/claims/{id}/resume`, `GET /v1/graph`, `GET /healthz`, `GET /readyz`.

### 3. Local development

```bash
npm ci
npm run lint && npm run format:check && npm run typecheck
npm test                     # unit tests (no external services)
npm run coverage             # unit tests with coverage
DATABASE_URL=postgres://claims:claims@localhost:5432/claims npm run test:integration
cp .env.example .env && node --env-file=.env apps/server/src/main.ts   # API against local Postgres
node apps/server/src/cli.ts graph   # print the agent graph as Mermaid
```

Integration tests (PostgreSQL) cover atomic commits and optimistic concurrency, the append-only trigger, lease contention, crash recovery across workers, concurrent drivers never executing a step twice, approvals across processes and "no raw PII anywhere in the database except vault ciphertext".

### 4. Evals

```bash
npm run eval   # golden set, deterministic fake LLM; writes evals-report/report.{json,md}; non-zero exit on failure
```

Current results (fake LLM): routing accuracy 100%, outcome accuracy 100%, payout accuracy 100%, guardrail rule recall 100%, **policy violations 0**, straight-through rate 25%, ~510 tokens and ~0.00012 USD per claim at the configured pricing. CI thresholds: routing/outcome/payout ≥ 95%, violations = 0, average cost ≤ 0.01 USD.

Policy violations are counted by **independent invariant checks**, not by trusting the engine: raw PII in any LLM prompt, audit event or API response; gated runs finalized without an approval; denials without a human; payouts > 10k without senior/SIU review; high fraud not routed to SIU; payout above limit; broken audit chain.

Run against a real model (same harness, same thresholds):

```bash
LLM_PROVIDER=openai_compatible LLM_BASE_URL=https://api.openai.com/v1 LLM_API_KEY=... LLM_MODEL=gpt-4o-mini npm run eval
# Azure OpenAI v1:  LLM_BASE_URL=https://<resource>.openai.azure.com/openai/v1 LLM_AUTH_HEADER=api-key
# Ollama:           LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.1:8b LLM_PROVIDER_NAME=ollama
```

Because outcomes are decided by rules, the ML model and the policy engine, routing metrics should be model-independent; a real-model run mainly measures cost, latency, fallback rate (`llm.fallback` events) and explanation quality.

## Configuration

All variables are validated at startup ([`apps/server/src/config.ts`](apps/server/src/config.ts)); see [`.env.example`](.env.example).

| Variable | Default | Description |
|---|---|---|
| `STORAGE` | `postgres` | `postgres` or `memory` |
| `DATABASE_URL` | - | PostgreSQL connection string (required for `postgres`) |
| `RUN_MIGRATIONS` | `true` | Apply Drizzle migrations at startup (Helm uses a Job instead) |
| `LLM_PROVIDER` | `fake` | `fake` (deterministic, refused in production) or `openai_compatible` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | - / - / `gpt-4o-mini` | OpenAI-compatible endpoint, key and model |
| `LLM_AUTH_HEADER` | `authorization` | `authorization` (Bearer) or e.g. `api-key` |
| `LLM_INPUT_PRICE_PER_MTOK` / `LLM_OUTPUT_PRICE_PER_MTOK` | `0.15` / `0.60` | Pricing used for cost accounting and budgets |
| `BUDGET_MAX_ITERATIONS` / `_LLM_TOKENS` / `_COST_USD` / `_TOOL_CALLS` / `_WALL_CLOCK_MS` | `20` / `24000` / `0.25` / `40` / `600000` | Per-run hard limits |
| `STEP_TIMEOUT_MS` / `STEP_MAX_ATTEMPTS` | `30000` / `3` | Default step timeout and retry attempts |
| `MCP_TRANSPORT` | `in-process` | `in-process` or `stdio` (separate tool-server processes) |
| `POLICY_FILE` | `config/claims-policy.json` | Guardrail policy document |
| `PII_ENCRYPTION_KEY` / `PII_TOKEN_SECRET` | ephemeral in dev | AES-256-GCM key (base64, 32 bytes) and HMAC secret; required in production |
| `API_KEYS` | `[]` | JSON list of `{id, tenantId, roles, sha256}` (hashed keys only) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | - | OTLP/HTTP endpoint for traces and metrics |
| `RECOVERY_INTERVAL_MS` | `30000` | Interval for recovering runs abandoned by crashed workers |

## Observability, security and responsible AI

**Observability.** Each run is one trace: `claims.run claims-triage` → `invoke_agent <step>` → `chat <model>` / `execute_tool <tool>` → server-side `tools/call <tool>` (W3C context propagated in MCP `_meta`). Spans follow the OpenTelemetry GenAI semantic conventions (`gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens/output_tokens`, `gen_ai.tool.name`, `gen_ai.conversation.id` = claim id) plus `mcp.method.name`. Metrics: `gen_ai.client.token.usage`, `gen_ai.client.operation.duration`, `claims.step.duration`, `claims.runs.finished`, `claims.policy.violations`, `claims.tool.calls`. Logs are JSON with `trace_id`/`span_id` and PII redaction.

**Security.**
- AuthN: API keys stored only as SHA-256 hashes, sent as `x-api-key` or bearer; every principal is bound to a tenant. In production place an API gateway with OIDC/JWT in front; the `Principal {id, tenantId, roles}` model stays the same.
- AuthZ: RBAC per use case (`claims_intake`, `adjuster`, `senior_adjuster`, `siu_investigator`, `auditor`, `operator`); approvals need the exact required role; the submitter cannot approve (four-eyes); every query is tenant-scoped.
- Input validation with Zod at the API, tool and LLM-output boundaries; body size limit; secure headers; problem+json errors that never echo provider responses.
- Least privilege for agents (tool grants per step) and for tool servers (only `document-extract` can decrypt documents). Container runs non-root with a read-only filesystem, all capabilities dropped; the Helm chart adds NetworkPolicy, PDB, seccomp and no service-account token.

**Responsible AI and guardrails.**
- The LLM never decides: outcomes come from deterministic coverage rules, the fraud model and the policy engine; adverse outcomes always need a human.
- Prompt-injection hardening: untrusted text is fenced and labelled as data, a heuristic detector flags attempts, flagged claims go to a human, and the architecture limits the blast radius to text quality.
- Data privacy: PII tokenized before persistence or prompting; DLP backstop with violation events; encrypted vault; no PII in logs or audit.
- Fairness: the fraud model excludes protected attributes and proxies; the model card lists the disparate-impact and drift monitoring required before production use.
- Failure modes: LLM outage → deterministic fallbacks (`llm.fallback` event); tool outage → retries then `failed` (resumable); budget exceeded or policy block → `failed`, never auto-decided; worker crash → automatic recovery from last checkpoint; duplicate submissions → idempotent replay.
- Cost controls: per-run token/cost/tool-call budgets with pre-flight estimation, cost recorded per run and per claim in evals, small-model default, CI cost threshold.

## Project layout

```
agentic-claims-orchestrator/
├── apps/server/            # API (Hono), CLI, MCP stdio entrypoint, eval harness, tests
├── packages/core/          # domain, runtime, policy engine, agents, PII vault, fraud scorer
├── packages/mcp-tools/     # MCP servers + governed gateway
├── packages/infra/         # PostgreSQL (Drizzle + migrations), LLM adapter, OTel, logging
├── config/claims-policy.json
├── evals/golden-claims.json
├── ml/                     # offline training (Python 3.13, uv) -> packages/core/src/ml/fraud-model.v1.json
├── deploy/helm/claims-orchestrator/
└── docs/                   # ADRs, model card
```

## Roadmap

- Streamable HTTP transport for MCP servers owned by separate teams, with OAuth-scoped tool access.
- OIDC/JWT authentication and per-tenant policy overlays; OPA/Cedar adapter behind the `Gate` port.
- Outbox-driven integrations in `finalize` (payments, claimant letters, core claims system) keyed by run id.
- Real-data retraining pipeline for the fraud model (selection-bias correction, disparate-impact report, drift monitoring) and a gradient-boosted challenger with exported SHAP values.
- LLM-assisted coverage interpretation as *advice* to adjusters, evaluated with an LLM-as-judge rubric plus human labels.
- Key rotation for the PII vault (key ids), daily anchoring of audit-chain heads in WORM storage, retention/erasure workflows.
- Load testing and SLOs (p95 triage latency, approval queue age) with burn-rate alerts.
