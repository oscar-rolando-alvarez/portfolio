# Enterprise RAG Platform

![CI](https://github.com/oscar-rolando-alvarez/portfolio/actions/workflows/enterprise-rag-platform.yml/badge.svg)

**A multi-tenant enterprise knowledge assistant that answers questions from internal
documents with verifiable citations, never shows anyone a document they are not allowed to
read, and says "I don't know" instead of guessing.**

## Executive summary

Knowledge workers lose hours every week searching wikis, policy PDFs, runbooks and shared
drives. In regulated industries (financial services, insurance, healthcare, public sector)
generic chatbots are not an option: every answer must be traceable to a source, and access
control must be as strict as in the source systems. This platform is the retrieval and
governance core such a company would buy or build. It ingests PDF, Markdown, HTML and text;
indexes them with tenant- and group-level ACLs; answers with inline citations through
permission-aware hybrid search; refuses when evidence is insufficient; and meters cost per
tenant. Buyers are the CIO/CDO or Head of Knowledge Management (internal assistant),
platform teams embedding "ask your docs" into SaaS products, and compliance-heavy
enterprises that need on-prem or VPC-isolated deployment with any model provider.

**Value hypotheses (estimates and assumptions, not measured results):**

| Hypothesis | Assumption behind it |
|---|---|
| ~2-4 hours saved per knowledge worker per week | Industry surveys commonly cite 1.5-2.5 h/day spent searching for information; capturing 20-30% of that time |
| ~USD 6-12k per worker per year in recovered time | 3 h/week x 46 weeks x USD 45-85 loaded hourly cost |
| 30-50% fewer "where is X?" tickets to HR/IT/ops | Most such tickets are answerable from existing documentation |
| Model spend under USD 0.01 per answered question | ~2.5k input + 300 output tokens on a small hosted model, minus semantic-cache hits |
| Lower compliance risk vs. ad-hoc chatbot use | ACLs enforced in the query, PII redacted before indexing, every answer cited and logged |

## Key capabilities

- **Ingestion pipeline**: upload PDF/Markdown/HTML/text -> structure-aware parsing ->
  heading-bounded chunking with section breadcrumbs -> PII detection/redaction -> injection
  scoring -> embeddings (unchanged chunks reuse stored vectors) -> atomic chunk swap.
  Idempotent by content hash; asynchronous via a Postgres `SKIP LOCKED` job queue with
  retries, backoff and leases.
- **Permission-aware hybrid retrieval**: PostgreSQL full-text (`ts_rank_cd`) + pgvector
  HNSW in one SQL statement, **tenant and group ACLs applied inside both index scans**, fused
  with Reciprocal Rank Fusion, reranked (lexical, HTTP cross-encoder or LLM), with query
  rewriting for conversational follow-ups. Row-level security as a second line of defence.
- **Grounded generation**: inline `[chunk-id]` citations validated against the context,
  refusal on weak evidence or model abstention, SSE streaming, prompt-injection
  heuristics on retrieved content, and a semantic cache keyed by tenant + ACL fingerprint +
  corpus version.
- **Evaluation as a release gate**: 26-item golden set covering answerable questions, ACL
  denials, cross-tenant isolation, prompt injection, PII and out-of-scope questions;
  recall@k, MRR, citation precision, faithfulness, answer accuracy, refusal accuracy, ACL
  leaks; thresholds enforced in CI; LLM-as-judge path for real models.
- **Observability and cost**: OpenTelemetry spans for rewrite/retrieve/rerank/generate
  using the GenAI semantic conventions (`gen_ai.*` token and model attributes), metrics for
  token usage, latency, refusals and spend; per-tenant usage ledger and `/v1/usage` report.
- **Security**: JWT (HS256 for dev, RS256/ES256 from your IdP) or hashed API keys carrying
  tenant, groups and roles; least-privilege upload rules; 404 for invisible documents.
- **Provider-agnostic**: any OpenAI-compatible endpoint (OpenAI, Azure OpenAI, vLLM, Ollama,
  LiteLLM) by configuration; deterministic offline fakes for tests, CI and the demo.
- **Deployable**: non-root multi-stage Docker image, docker-compose stack with Jaeger, and a
  Terraform module for AWS (ECS Fargate + RDS PostgreSQL with pgvector + ALB + KMS +
  Secrets Manager + ADOT sidecar).

## Architecture

### C4: system context

```mermaid
flowchart LR
    employee["Employee / analyst<br/>(web app, chat tool, IDE)"]
    admin["Tenant admin / editor<br/>(uploads, ACLs, API keys)"]
    idp["Identity provider<br/>(OIDC: tid, groups, roles)"]
    rag["Enterprise RAG Platform<br/>(ingest, retrieve, answer with citations)"]
    llm["Model provider<br/>(OpenAI-compatible: OpenAI, Azure OpenAI, vLLM, Ollama)"]
    obs["Observability backend<br/>(OTLP: Jaeger, X-Ray, Grafana)"]

    employee -- "questions (HTTPS + JWT)" --> rag
    admin -- "documents + ACLs" --> rag
    idp -- "signed tokens" --> employee
    idp -- "signed tokens" --> admin
    rag -- "embeddings + chat completions" --> llm
    rag -- "traces, metrics" --> obs
```

### C4: containers

```mermaid
flowchart TB
    client["API clients"]
    subgraph platform["Enterprise RAG Platform"]
        api["API service<br/>FastAPI, auth, SSE streaming"]
        worker["Ingestion worker<br/>parse, chunk, PII, embed"]
        subgraph core["Application core (ports and adapters)"]
            ingest["IngestionService"]
            retr["RetrievalService<br/>rewrite, hybrid, RRF, rerank, guard"]
            answer["AnswerService<br/>grounding, citations, refusal, cache"]
        end
        db[("PostgreSQL + pgvector<br/>documents, chunks (tsvector + HNSW),<br/>jobs, semantic cache, usage, API keys, RLS")]
    end
    llm["OpenAI-compatible model endpoint"]
    otel["OTel collector / Jaeger"]

    client -->|"HTTPS"| api
    api --> ingest
    api --> answer
    answer --> retr
    worker --> ingest
    ingest -->|"SQL"| db
    retr -->|"one hybrid SQL query<br/>ACL filter inside"| db
    answer -->|"cache, usage"| db
    worker -->|"SKIP LOCKED claim"| db
    ingest -->|"embeddings"| llm
    retr -->|"query embedding"| llm
    answer -->|"chat (stream)"| llm
    api -.->|"OTLP"| otel
    worker -.->|"OTLP"| otel
```

### Core request flow: a question

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as API (auth)
    participant S as AnswerService
    participant R as RetrievalService
    participant P as PostgreSQL + pgvector
    participant M as Model endpoint

    C->>A: POST /v1/query/stream (Bearer JWT)
    A->>A: verify token, build Principal(tenant, groups, roles)
    A->>S: stream(principal, question, history)
    S->>R: prepare: rewrite query + embed
    R->>M: POST /embeddings
    S->>S: injection check on the query
    S->>P: semantic cache lookup (tenant, ACL key, corpus version)
    alt cache hit
        S-->>C: meta, token, done (cached answer)
    else cache miss
        S->>R: search(prepared)
        R->>P: hybrid SQL: FTS leg + HNSW leg, both filtered by tenant and ACL
        P-->>R: candidates with lexical/vector ranks
        R->>R: RRF fusion, rerank, drop injected chunks
        alt no evidence or low relevance
            S-->>C: done (refused, no model call)
        else enough evidence
            S->>M: chat/completions (stream) with delimited sources
            M-->>S: token deltas + usage
            S-->>C: token events (sentinel held back)
            S->>S: validate citations against context
            S->>P: store usage event, cache answer
            S-->>C: done (answer, citations, usage)
        end
    end
```

### Ingestion flow and document lifecycle

```mermaid
stateDiagram-v2
    [*] --> Deduplicated: same external_id + content hash + ACL
    [*] --> Pending: new document or new version
    Deduplicated --> [*]: return existing (HTTP 200)
    Pending --> Processing: worker claims job (FOR UPDATE SKIP LOCKED)
    Processing --> Ready: parse, chunk, redact PII, score injection, embed (reuse by hash), swap chunks, bump corpus version
    Processing --> Pending: transient error (backoff + jitter, attempts < max)
    Processing --> Failed: corrupt/unsupported input or attempts exhausted
    Ready --> Pending: re-upload with changed content or ACL
    Failed --> Pending: re-upload
    Ready --> [*]: delete (cascade chunks, bump corpus version)
```

### Architecture Decision Records

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-postgres-pgvector-as-the-single-datastore.md) | PostgreSQL + pgvector as the single datastore |
| [0002](docs/adr/0002-permission-filtering-inside-the-query.md) | Tenant/ACL filtering inside the retrieval query, backed by row-level security |
| [0003](docs/adr/0003-hybrid-retrieval-with-rrf-and-reranking.md) | Hybrid retrieval fused with RRF, then reranked |
| [0004](docs/adr/0004-provider-agnostic-ports-and-deterministic-fakes.md) | Provider-agnostic model ports with deterministic offline fakes |
| [0005](docs/adr/0005-grounding-contract-refusals-and-semantic-cache.md) | Grounding contract, refusals, injection defences, ACL-aware semantic cache |
| [0006](docs/adr/0006-postgres-job-queue-for-ingestion.md) | PostgreSQL-backed ingestion queue with `SKIP LOCKED` |

## Tech stack

| Area | Choice | Version |
|---|---|---|
| Language / packaging | Python, uv, hatchling | 3.13, uv 0.13 |
| API | FastAPI, Uvicorn, Pydantic v2, pydantic-settings | 0.143.3, 0.54.0, 2.14.1, 2.16.0 |
| Data access | SQLAlchemy 2 async (Core), asyncpg, Alembic | 2.1.5, 0.32.0, 1.20.0 |
| Database | PostgreSQL + pgvector (HNSW, iterative scans) | PostgreSQL 18 / pgvector 0.8.7 locally; RDS PostgreSQL 17 |
| Parsing | pypdf, BeautifulSoup | 6.21.0, 4.15.0 |
| Model access | httpx (OpenAI-compatible wire protocol), tenacity | 0.28.1, 9.2.1 |
| Auth | PyJWT (HS/RS/ES), SHA-256 hashed API keys | 2.15.1 |
| Observability | OpenTelemetry SDK + OTLP, structlog (JSON) | 1.45.1, 26.1.0 |
| Quality | pytest, ruff, mypy (strict), pip-audit | 9.1.1, 0.17.1, 2.4.0, 2.10.1 |
| Delivery | Docker (multi-stage, non-root), docker compose, Jaeger | Jaeger 2.22.0 |
| IaC | Terraform, AWS provider (ECS Fargate, RDS, ALB, KMS) | 1.16.6, 6.69 |

## Quickstart

### Full stack with Docker (offline, no API key needed)

```bash
cd enterprise-rag-platform
docker compose up -d --build --wait api worker jaeger    # Postgres, migrations, API, worker, Jaeger

# mint a local dev token (tenant "acme", group "engineering", role "editor")
TOKEN=$(docker compose exec -T api ragplatform dev-token --tenant acme --groups engineering --roles editor)

# upload a document (ACL defaults to the uploader's groups)
curl -s -X POST localhost:8000/v1/documents -H "Authorization: Bearer $TOKEN" \
     -F file=@evals/corpus/oncall-runbook.md

# ask a question
curl -s -X POST localhost:8000/v1/query -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"question": "How quickly must a Sev1 page be acknowledged?"}'

# stream the answer (Server-Sent Events: meta -> token* -> done)
curl -N -X POST localhost:8000/v1/query/stream -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' -d '{"question": "Which command rolls back a bad release?"}'
```

Example response (abridged):

```json
{
  "answer": "A Sev1 page must be acknowledged within 5 minutes. [1fd8154c-8632-505c-b210-00cb94821eb7]",
  "citations": [{"chunk_id": "1fd8154c-...", "document_title": "Production On-Call Runbook",
                 "section": "Production On-Call Runbook > Paging and Severity", "snippet": "..."}],
  "refused": false,
  "usage": {"input_tokens": 343, "output_tokens": 17, "cost_usd": 0.0},
  "guardrails": {"dropped_for_injection": 0, "top_relevance": 0.7475, "invalid_citations": 0}
}
```

OpenAPI docs: <http://localhost:8000/docs>. Traces: <http://localhost:16686> (service
`enterprise-rag-platform`). Ports are configurable with `RAG_API_PORT`, `RAG_PG_PORT`,
`JAEGER_UI_PORT`, `OTLP_PORT`.

### Zero-dependency demo (in-memory, no Docker)

```bash
uv run ragplatform ask "How many weeks of paid parental leave are offered?"
uv run ragplatform ask "What is the Q3 revenue forecast?" --groups engineering   # refused: finance-only doc
uv run ragplatform ask "What is the Q3 revenue forecast?" --groups finance       # answered with citation
```

### Using a real model

Copy `.env.example` to `.env` and set, for example:

```bash
RAG_LLM_PROVIDER=openai
RAG_LLM_BASE_URL=https://api.openai.com/v1        # or http://localhost:11434/v1 (Ollama), a vLLM or LiteLLM URL
RAG_LLM_API_KEY=...
RAG_LLM_MODEL=gpt-4o-mini
RAG_EMBEDDING_PROVIDER=openai
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_EMBEDDING_DIM=384                             # must match the vector column (migration)
```

## Local development

```bash
uv sync                                   # Python 3.13 venv with dev tools
uv run ruff check src tests migrations && uv run ruff format --check src tests migrations
uv run mypy                               # strict
uv run pytest tests/unit --cov            # unit + API + offline eval gate (no services)

docker compose up -d postgres
export RAG_DATABASE_URL=postgresql+asyncpg://rag:rag@localhost:5432/rag
uv run ragplatform migrate
uv run pytest tests/integration           # hybrid SQL, RLS, SKIP LOCKED, cache, API on pgvector
uv run ragplatform serve                  # API on :8000
uv run ragplatform worker                 # ingestion worker (RAG_INGESTION_MODE=queue)
uv run ragplatform create-api-key acme ci-bot --groups engineering --roles reader
```

## Evaluation

The harness (`src/ragplatform/evals`) ingests [`evals/corpus`](evals/corpus) into a fresh
tenant plus a decoy tenant, runs every item in [`evals/golden.jsonl`](evals/golden.jsonl)
through retrieval and the full answer pipeline, and fails when any threshold in
[`evals/thresholds.json`](evals/thresholds.json) is missed.

```bash
uv run ragplatform evaluate                                   # in-memory + fakes
RAG_DATABASE_URL=... uv run ragplatform evaluate --report eval-report.json   # on pgvector (CI gate)
RAG_LLM_PROVIDER=openai RAG_LLM_API_KEY=... uv run ragplatform evaluate --judge llm   # real model + LLM judge
```

| Metric | What it checks | Threshold | Current (fakes, pgvector) |
|---|---|---|---|
| recall@5 | a relevant document is in the top 5 | >= 0.95 | 1.00 |
| MRR | rank of the first relevant chunk | >= 0.80 | 0.97 |
| citation precision | cited chunks come from relevant documents | >= 0.90 | 1.00 |
| faithfulness | answer sentences supported by cited text (lexical; LLM judge optional) | >= 0.90 | 1.00 |
| answer accuracy | expected facts present | >= 0.85 | 0.95 |
| refusal accuracy | refuses exactly the unanswerable / unauthorised items | >= 0.90 | 0.92 |
| ACL leaks | forbidden documents retrieved, used or cited | = 0 | 0 |
| forbidden strings | PII, other-tenant data or injected text in answers | = 0 | 0 |

The two known misses with the offline fakes are kept on purpose (a vocabulary-mismatch
question the extractive fake declines, and an out-of-scope question with partial lexical
overlap): they show the gate measures real behaviour rather than being tuned to 100%.

## Configuration

All settings are environment variables with the `RAG_` prefix (see
[`config.py`](src/ragplatform/config.py) and [`.env.example`](.env.example)).

| Variable | Default | Purpose |
|---|---|---|
| `RAG_DATABASE_URL` | unset (in-memory) | `postgresql+asyncpg://...`; alternatively `RAG_DB_HOST/PORT/NAME/USER/PASSWORD/SSL` |
| `RAG_EMBEDDING_DIM` | `384` | vector dimension (fixed at migration time) |
| `RAG_JWT_SECRET` / `RAG_JWT_ALGORITHM` / `RAG_JWT_PUBLIC_KEY` | dev secret / `HS256` / unset | token verification; use RS256/ES256 with your IdP key in production |
| `RAG_JWT_ISSUER` / `RAG_JWT_AUDIENCE` | example values | required `iss` / `aud` claims |
| `RAG_ALLOW_DEV_TOKENS` | `true` | enables `ragplatform dev-token`; disable in production |
| `RAG_LLM_PROVIDER` / `_BASE_URL` / `_API_KEY` / `_MODEL` | `fake` | chat model (OpenAI-compatible) |
| `RAG_EMBEDDING_PROVIDER` / `_BASE_URL` / `_API_KEY` / `_MODEL` | `fake` | embedding model (OpenAI-compatible) |
| `RAG_RERANKER` / `RAG_RERANKER_URL` | `lexical` | `none`, `lexical`, `http` (TEI/Infinity/vLLM `/rerank`), `llm` |
| `RAG_QUERY_REWRITER` | `heuristic` | `heuristic` or `llm` |
| `RAG_RETRIEVAL_CANDIDATES` / `RAG_RETRIEVAL_TOP_K` / `RAG_RRF_K` | `40` / `6` / `60` | retrieval breadth, context size, RRF constant |
| `RAG_MIN_RELEVANCE` | `0.12` | evidence threshold below which the system refuses |
| `RAG_MAX_CONTEXT_TOKENS` / `RAG_LLM_MAX_OUTPUT_TOKENS` | `3000` / `700` | per-request token budget (cost control) |
| `RAG_INJECTION_POLICY` / `RAG_INJECTION_THRESHOLD` | `drop` / `0.5` | handling of suspicious retrieved chunks |
| `RAG_INGESTION_MODE` | `inline` | `inline` (sync) or `queue` (worker) |
| `RAG_CHUNK_TARGET_TOKENS` / `RAG_CHUNK_OVERLAP_TOKENS` | `220` / `40` | chunking |
| `RAG_REDACT_PII_DEFAULT` | `true` | redact PII before indexing unless the upload opts out |
| `RAG_MAX_UPLOAD_BYTES` | `20971520` | upload size limit |
| `RAG_CACHE_ENABLED` / `RAG_CACHE_SIMILARITY` / `RAG_CACHE_TTL_S` | `true` / `0.97` / `3600` | semantic cache |
| `RAG_MODEL_PRICING` | built-in table | JSON, USD per 1K input/output tokens per model |
| `RAG_OTEL_EXPORTER_OTLP_ENDPOINT` | unset | OTLP/gRPC endpoint for traces and metrics |

## API

| Method | Path | Who | Description |
|---|---|---|---|
| `POST` | `/v1/documents` | editor, admin | multipart upload; `acl_groups`, `external_id`, `title`, `redact_pii`; 201 ingested, 202 queued, 200 unchanged |
| `GET` | `/v1/documents`, `/v1/documents/{id}` | any | only documents visible to the caller (404 otherwise) |
| `DELETE` | `/v1/documents/{id}` | editor, admin | delete document and chunks, invalidate cache |
| `POST` | `/v1/query` | any | grounded answer with citations or a refusal |
| `POST` | `/v1/query/stream` | any | same, as Server-Sent Events |
| `GET` | `/v1/usage` | admin | tokens and estimated cost by operation and model |
| `POST` | `/v1/admin/api-keys` | admin | create a tenant-scoped API key (shown once) |
| `GET` | `/v1/me`, `/healthz`, `/readyz` | any / public | identity, liveness, readiness |

## Observability, security and responsible AI

**Observability.** Every request produces a trace: `rag.query` -> `rag.rewrite`,
`embeddings {model}`, `rag.retrieve` (candidate counts per leg), `rag.rerank` (top score,
latency), `chat {model}` (`gen_ai.operation.name`, `gen_ai.provider.name`,
`gen_ai.request.model`, `gen_ai.usage.input_tokens/output_tokens`, time to first token,
prompt version). Metrics: `gen_ai.client.token.usage`, `gen_ai.client.operation.duration`,
`rag.cost.usd`, `rag.refusals`, `rag.cache.lookups`. Logs are JSON with request, tenant,
trace and span IDs. Prompt and document content is never written to spans or logs.

**Security model.**
- AuthN: JWT bearer (issuer, audience, expiry required) or `X-API-Key` (SHA-256 hashed,
  revocable). AuthZ: roles `reader` < `editor` < `admin`; group ACLs per document; editors
  cannot share beyond their own groups.
- Isolation: tenant + ACL predicates inside retrieval SQL, PostgreSQL RLS
  (`FORCE ROW LEVEL SECURITY`) on every tenant table, cache partitioned per ACL
  fingerprint, invisible documents return 404.
- Data protection: PII (emails, phones, SSNs, cards with Luhn, IBANs with mod-97, IPs)
  redacted before chunking/embedding by default; KMS encryption for RDS, logs, ECR and
  secrets; TLS 1.3 at the load balancer and `rds.force_ssl`; secrets only via env/Secrets
  Manager.
- Runtime: non-root UID 10001, read-only root filesystem, all capabilities dropped,
  pinned base image digest, `pip-audit` in CI.

**Guardrails and failure modes.**

| Failure mode | Mitigation |
|---|---|
| Hallucinated answer | mandatory citations validated against the context; uncited output becomes a refusal |
| Insufficient evidence | refuse before calling the model (relevance threshold) or on model abstention |
| Indirect prompt injection in documents | scored at ingestion and query time, dropped or flagged, sources delimited and escaped |
| Jailbreak-style queries | strongly suspicious queries refused (`unsafe_query`) |
| Permission leak through cache | cache keyed by tenant + ACL fingerprint + corpus version |
| Stale answers after updates | corpus version bump on every ingest/delete; chunk ACLs updated in the same transaction |
| Provider outage / rate limits | retries with exponential backoff and jitter on 429/5xx/timeouts; ingestion jobs retried with leases |
| Worker crash mid-job | lease expiry re-queues the job; idempotent chunk IDs and atomic swap |

**Cost controls.** Embeddings are reused for unchanged chunks; refusals on weak evidence
skip the model call; the semantic cache short-circuits repeated questions; context and
output token budgets are capped; every model call is written to a per-tenant ledger with
estimated USD cost; workers run on Fargate Spot and Graviton.

## Reference deployment (Terraform, AWS)

[`infra/terraform/modules/rag_platform`](infra/terraform/modules/rag_platform) provisions:
ECR (immutable tags, scan on push), KMS key, Secrets Manager secret (populated
out-of-band), RDS PostgreSQL 17 (pgvector, Multi-AZ, encrypted, forced TLS, IAM auth,
managed master password, Performance Insights), ECS Fargate cluster with API service
(ALB, HTTPS listener with TLS 1.3 policy, CPU target-tracking autoscaling, deployment
circuit breaker) and worker service (Spot-weighted), a one-off migration task, an ADOT
sidecar exporting traces to X-Ray, least-privilege security groups and IAM roles.
[`envs/reference`](infra/terraform/envs/reference) adds a two-AZ VPC. CI runs
`terraform fmt -check` and `terraform validate` without cloud credentials.

## Project layout

```text
src/ragplatform/
  domain/          models, ports (protocols), errors, text utils   <- no framework imports
  ingestion/       parsers, structure-aware chunker, PII, IngestionService
  retrieval/       RRF fusion, rerankers, query rewriters, RetrievalService
  generation/      prompts, guardrails, citation validation, AnswerService (sync + SSE)
  adapters/        postgres (SQL, RLS, queue, cache), memory, llm (OpenAI-compatible, fakes)
  api/             FastAPI app, auth, routes, schemas
  worker/          SKIP LOCKED ingestion worker
  observability/   OpenTelemetry + structlog setup, cost meter
  evals/           metrics and harness
  container.py     composition root (dependency injection)
migrations/        Alembic (schema, HNSW/GIN indexes, RLS policies)
evals/             golden set, corpus, thresholds
infra/terraform/   AWS module + reference environment
docs/adr/          architecture decision records
```

## Roadmap

- Connectors (SharePoint, Confluence, Google Drive, S3) with incremental sync and source ACL mirroring
- Object storage for raw documents; OCR for scanned PDFs; table-aware chunking
- Model-based PII/NER and an injection classifier behind the existing detector interfaces
- Group resolution from SCIM / an external authorization service (OPA, Zanzibar-style)
- Per-tenant rate limits and token budgets enforced at the API edge
- Answer feedback loop (thumbs up/down) feeding the golden set; online evals on sampled traffic
- Tenant-hash partitioning of `chunks` and read replicas for retrieval at larger scale
- Helm chart / GKE + Cloud SQL variant of the reference deployment
