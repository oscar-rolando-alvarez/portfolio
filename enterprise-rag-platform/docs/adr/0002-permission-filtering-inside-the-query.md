# ADR 0002: Enforce tenant and document ACLs inside the retrieval query, backed by RLS

- Status: Accepted
- Date: 2026-10-17

## Context

A RAG system that retrieves first and filters later leaks information: a restricted chunk
can still influence ranking, be passed to the model, be cached, or be counted in "top-k"
so that the caller receives fewer results (which itself is a side channel). Multi-tenant
SaaS also needs a hard guarantee that a bug in one query cannot cross tenants.

## Decision

1. **Identity comes only from a verified credential.** JWT (`tid`, `groups`, `roles`) or a
   hashed API key resolves to a `Principal`; nothing in the request body can change it.
2. **ACLs are denormalised onto every chunk** (`tenant_id`, `acl_groups text[]`) and both
   retrieval legs filter with `tenant_id = :tenant AND acl_groups && :groups` inside their
   index scans, before ranking and `LIMIT`. Every tenant member implicitly has group `*`.
3. **Row-level security** (`FORCE ROW LEVEL SECURITY`, policy on
   `current_setting('app.tenant_id')`) on all tenant tables; every transaction sets
   `app.tenant_id`. If application code forgets a predicate, the database still returns
   nothing from other tenants. An integration test proves this with a non-superuser role.
4. **ACL changes take effect immediately**: updating a document's ACL rewrites its chunks'
   ACLs in the same transaction; the semantic cache is partitioned by an ACL fingerprint.
5. Invisible documents return **404, not 403**, so the API is not an existence oracle.
6. Editors can only share documents with groups they belong to (least privilege).

## Consequences

- No post-filter leaks; recall is preserved for restricted users because filtering happens
  before `LIMIT` (and HNSW iterative scans keep going until enough rows pass the filter).
- ACL arrays are duplicated per chunk (cheap) and must be kept in sync (single code path).
- RLS only protects when the application role is not a superuser; the RDS master user is
  not a true superuser, and docs call out using a dedicated non-owner role in production.

## Alternatives considered

- **Post-filtering** retrieved results: simple, but leaks via ranking/top-k and is easy to
  get wrong in caches and streaming.
- **Index per tenant / per group**: strong isolation, but explodes index count for
  group-level ACLs and complicates operations.
- **External authorization service (OPA, Zanzibar-style)**: right for complex relationship
  ACLs; the `Principal` abstraction leaves room to resolve groups from such a service.
