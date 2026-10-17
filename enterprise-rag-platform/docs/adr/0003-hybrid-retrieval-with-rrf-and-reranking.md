# ADR 0003: Hybrid retrieval fused with Reciprocal Rank Fusion, then reranked

- Status: Accepted
- Date: 2026-10-17

## Context

Enterprise questions mix exact tokens (policy codes, product names, error messages, CLI
commands such as `deployctl rollback`) with paraphrases ("how long until laptops are
replaced"). Dense retrieval misses rare exact tokens; lexical retrieval misses paraphrases.
Scores from BM25 and cosine similarity live on incomparable scales.

## Decision

- Run a lexical leg (`tsvector`, OR-of-terms `to_tsquery`, `ts_rank_cd`) and a vector leg
  (pgvector HNSW) in a single SQL statement, each returning its own ranks.
- Fuse with **RRF**: `score = sum 1 / (k + rank)`, `k = 60`, normalised to 0..1 so the
  refusal threshold does not depend on `k`.
- Rerank the fused pool through a `Reranker` port: deterministic lexical reranker by
  default, an HTTP cross-encoder (TEI / Infinity / vLLM `/rerank`) or an LLM listwise
  reranker by configuration.
- Index text includes a **contextual header** (document title + section breadcrumb) so
  short chunks keep their meaning; chunking is structure-aware (headings are hard
  boundaries).
- Query rewriting (heuristic or LLM) turns conversational follow-ups into standalone queries.

## Consequences

- Robust recall without per-corpus score calibration; the eval harness tracks
  recall@k and MRR to catch regressions when any of these knobs change.
- Two index scans per query (both filtered); measured p95 on the golden set stays in the
  tens of milliseconds locally.
- The reranker score doubles as the evidence-sufficiency signal for refusals (ADR 0005).

## Alternatives considered

- **Vector-only**: simplest, measurably worse on exact-token questions.
- **Weighted score sum / learned fusion**: needs calibration data per corpus; RRF is
  parameter-light and competitive. Weights are still exposed in `reciprocal_rank_fusion`.
- **SPLADE / learned sparse**: promising; would replace the lexical leg behind the same port.
