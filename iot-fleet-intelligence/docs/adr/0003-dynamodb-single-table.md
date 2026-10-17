# ADR 0003 - DynamoDB single-table design

- Status: accepted
- Date: 2026-10-17

## Context
We persist incidents, their enrichment and diagnoses, detector state per stream shard, an enrichment cache
and idempotency records. Access is by key and by tenant timeline; there are no ad-hoc joins. Lambda needs a
database without connection pools, and cost should be pay-per-request.

## Decision
One on-demand DynamoDB table (`PK`, `SK`, two GSIs, TTL on `ttl`, PITR, KMS):

| # | Access pattern | Key condition |
|---|---|---|
| 1 | Incident bundle (meta + enrichment + diagnoses) in **one query** | `PK = INC#<id>` |
| 2 | Tenant incidents, newest first | `GSI1PK = TENANT#<t>`, `GSI1SK` desc |
| 3 | Tenant incidents by status | `GSI2PK = TENANT#<t>#STATUS#<s>`, `GSI2SK` desc |
| 4 | Detector state per Kafka partition (zlib blob, version, last offset) | `PK = DETSTATE#<topic>#<partition>` |
| 5 | Enrichment cache entry (TTL, also checked on read) | `PK = CACHE#<provider>#<key>` |
| 6 | Powertools idempotency records | `PK = idempotency#<fn>`, `SK = <hash>` |

Items: `INC#id/META` (incident JSON + status/GSI keys), `INC#id/ENRICH`, `INC#id/DIAG#<timestamp>`.

## Consequences
- Every API read is a single Query; cost per request is predictable (modelled in the cost estimator).
- Writes are conditional: incident creation uses `attribute_not_exists`, episode extension never moves
  `last_seen_at` backwards and never overwrites status, state saves use a version check. Replays and duplicate
  deliveries are safe.
- Pagination cursors are validated to belong to the caller's tenant partition (no cross-tenant pivoting).
- Changing access patterns later needs new GSIs or backfills - acceptable for a well-understood domain.

## Alternatives considered
- **Aurora Serverless/Postgres**: flexible queries, but connection management from Lambda (RDS Proxy) and a
  higher idle cost for a key-value workload.
- **Multiple tables**: simpler mental model, but more IAM/infra surface and no single-query bundle read.
