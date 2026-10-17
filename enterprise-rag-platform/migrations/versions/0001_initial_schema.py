"""Initial schema: documents, chunks (pgvector + tsvector), jobs, cache, usage, API keys, RLS.

Revision ID: 0001
Revises:
Create Date: 2026-10-17
"""

from __future__ import annotations

from alembic import op

from ragplatform.config import get_settings

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = ("documents", "document_blobs", "chunks", "semantic_cache", "usage_events")


def upgrade() -> None:
    dim = int(get_settings().embedding_dim)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        """
        CREATE TABLE tenants (
            id             text PRIMARY KEY,
            corpus_version bigint NOT NULL DEFAULT 0,
            created_at     timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE documents (
            id           uuid PRIMARY KEY,
            tenant_id    text NOT NULL,
            external_id  text NOT NULL,
            title        text NOT NULL,
            mime_type    text NOT NULL,
            content_hash text NOT NULL,
            acl_groups   text[] NOT NULL CHECK (cardinality(acl_groups) > 0),
            redact_pii   boolean NOT NULL,
            status       text NOT NULL CHECK (status IN ('pending','processing','ready','failed')),
            version      integer NOT NULL DEFAULT 1,
            chunk_count  integer NOT NULL DEFAULT 0,
            error        text,
            metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT documents_tenant_external_uq UNIQUE (tenant_id, external_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX documents_tenant_created_idx ON documents (tenant_id, created_at DESC)"
    )
    op.execute(
        """
        CREATE TABLE document_blobs (
            document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
            tenant_id   text NOT NULL,
            data        bytea NOT NULL
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE chunks (
            id           uuid PRIMARY KEY,
            tenant_id    text NOT NULL,
            document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            ordinal      integer NOT NULL,
            title        text NOT NULL DEFAULT '',
            section_text text NOT NULL DEFAULT '',
            content      text NOT NULL,
            content_hash text NOT NULL,
            token_count  integer NOT NULL,
            section_path text[] NOT NULL DEFAULT '{{}}',
            page         integer,
            acl_groups   text[] NOT NULL,
            metadata     jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            embedding    vector({dim}) NOT NULL,
            tsv          tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('english', title || ' ' || section_text), 'A') ||
                setweight(to_tsvector('english', content), 'B')
            ) STORED
        )
        """
    )
    op.execute("CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv)")
    op.execute(
        "CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )
    op.execute("CREATE INDEX chunks_acl_idx ON chunks USING gin (acl_groups)")
    op.execute("CREATE INDEX chunks_tenant_doc_idx ON chunks (tenant_id, document_id)")
    op.execute("CREATE INDEX chunks_tenant_hash_idx ON chunks (tenant_id, content_hash)")
    op.execute(
        """
        CREATE TABLE ingestion_jobs (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   text NOT NULL,
            document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            status      text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','succeeded','failed')),
            attempts    integer NOT NULL DEFAULT 0,
            run_after   timestamptz NOT NULL DEFAULT now(),
            locked_at   timestamptz,
            last_error  text,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX ingestion_jobs_ready_idx ON ingestion_jobs (run_after) "
        "WHERE status IN ('queued','running')"
    )
    op.execute(
        f"""
        CREATE TABLE semantic_cache (
            id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            tenant_id      text NOT NULL,
            acl_key        text NOT NULL,
            corpus_version bigint NOT NULL,
            query          text NOT NULL,
            embedding      vector({dim}) NOT NULL,
            payload        jsonb NOT NULL,
            expires_at     timestamptz NOT NULL,
            created_at     timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX semantic_cache_partition_idx ON semantic_cache "
        "(tenant_id, acl_key, corpus_version, expires_at)"
    )
    op.execute(
        """
        CREATE TABLE usage_events (
            id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            tenant_id     text NOT NULL,
            subject       text,
            operation     text NOT NULL,
            model         text NOT NULL,
            input_tokens  integer NOT NULL,
            output_tokens integer NOT NULL,
            cost_usd      numeric(18, 10) NOT NULL,
            latency_ms    double precision NOT NULL,
            created_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX usage_events_tenant_time_idx ON usage_events (tenant_id, created_at)")
    op.execute(
        """
        CREATE TABLE api_keys (
            key_hash   text PRIMARY KEY,
            key_id     text NOT NULL UNIQUE,
            tenant_id  text NOT NULL,
            name       text NOT NULL,
            groups     text[] NOT NULL DEFAULT '{}',
            roles      text[] NOT NULL DEFAULT '{reader}',
            revoked    boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    # Defence in depth: row-level security keyed on a per-transaction setting. FORCE makes
    # it apply to the table owner too (only true superusers bypass it, which the app role
    # must never be).
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )


def downgrade() -> None:
    for table in (
        "api_keys",
        "usage_events",
        "semantic_cache",
        "ingestion_jobs",
        "chunks",
        "document_blobs",
        "documents",
        "tenants",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
