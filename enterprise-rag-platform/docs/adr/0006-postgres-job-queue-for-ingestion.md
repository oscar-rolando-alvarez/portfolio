# ADR 0006: PostgreSQL-backed ingestion queue (`FOR UPDATE SKIP LOCKED`)

- Status: Accepted
- Date: 2026-10-17

## Context

Parsing, chunking and embedding large documents must not block upload requests, must
survive restarts and must retry transient provider failures. Throughput needs are modest
(thousands of documents per hour per tenant), and ADR 0001 already commits to Postgres.

## Decision

- `ingestion_jobs` table; workers claim with
  `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)`, so any number of
  worker replicas run concurrently without a broker.
- Leases: a `running` job whose `locked_at` is older than 15 minutes is re-claimable
  (crashed worker). Exponential backoff with jitter, max attempts, permanent failure for
  non-retryable errors (unsupported/corrupt documents).
- Jobs are idempotent: chunk IDs are deterministic (`uuid5(document_id, ordinal:hash)`),
  chunks are swapped atomically, and unchanged chunks reuse stored embeddings by content
  hash, so a retried or duplicated job costs nothing extra.
- Upload itself is idempotent by `(tenant, external_id, content hash, ACL)`.
- `RAG_INGESTION_MODE=inline` processes synchronously for demos and tests.

## Consequences

- No Redis/SQS to operate; enqueue is in the same database as the document row.
- Workers fit Fargate Spot (interruptions only cause a retry).
- At very high throughput the queue table becomes a hot spot; then switch the `JobQueue`
  port to SQS/PubSub or arq without touching the ingestion service.

## Alternatives considered

- **arq/Celery + Redis**: mature, but another stateful service and a dual-write between
  the document row and the broker.
- **SQS + Lambda**: elastic, but cold starts with heavy parsing deps and harder local dev.
