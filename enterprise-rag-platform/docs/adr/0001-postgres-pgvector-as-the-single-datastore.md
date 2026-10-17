# ADR 0001: PostgreSQL + pgvector as the single datastore

- Status: Accepted
- Date: 2026-10-17

## Context

The platform needs document metadata, raw blobs, chunk text, a full-text index, a vector
index, an ingestion queue, a semantic cache, a usage ledger and API keys. Each of these
could be its own product (object store, Elasticsearch/OpenSearch, a vector database,
Redis, SQS...). Customers in regulated industries also ask the same questions about every
extra system: where is the data, who can read it, how is it backed up and encrypted.

## Decision

Use one managed PostgreSQL (RDS / Cloud SQL / AlloyDB / Azure Flexible Server all ship
pgvector) for all of it:

- `tsvector` + GIN index for BM25-like lexical ranking (`ts_rank_cd`);
- pgvector HNSW (`vector_cosine_ops`) for ANN, with `hnsw.iterative_scan` (pgvector >= 0.8)
  so that selective tenant/ACL filters do not starve the result set;
- `FOR UPDATE SKIP LOCKED` for the job queue (see ADR 0006);
- row-level security for tenant isolation (see ADR 0002).

## Consequences

- One backup, encryption, IAM and audit story; transactional consistency between a
  document, its chunks and its ACL (re-ingestion swaps chunks atomically).
- Hybrid retrieval is one SQL round trip, and ACL filtering is part of the same query plan.
- Scale ceiling: a single primary comfortably serves tens of millions of chunks with HNSW
  on a memory-optimised instance; beyond that, partition `chunks` by tenant hash or move
  the vector leg behind the existing `SearchIndex` port.
- Raw blobs in `bytea` are fine for a reference deployment; large corpora should move them
  to object storage behind the `DocumentStore` port (roadmap).

## Alternatives considered

- **Dedicated vector DB (Pinecone, Weaviate, Qdrant, Milvus)**: better at billion-scale ANN,
  but adds a second source of truth for ACLs, a sync pipeline and another compliance
  surface; metadata filtering semantics differ per vendor.
- **OpenSearch for both lexical and vector**: strong lexical features, but heavier to run
  and still needs a transactional store for jobs, usage and keys.
