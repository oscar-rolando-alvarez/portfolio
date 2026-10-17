# ADR 0005: Grounding contract, refusals, injection defences and an ACL-aware cache

- Status: Accepted
- Date: 2026-10-17

## Context

In regulated settings a wrong but confident answer is worse than no answer. Users must be
able to verify every claim. Retrieved documents are untrusted input (indirect prompt
injection). Repeated questions are common and LLM calls dominate cost and latency, but a
naive cache can serve one user's answer to someone with fewer permissions.

## Decision

- **Citations are mandatory**: the model must cite chunk IDs inline; citations are
  validated against the exact context that was sent. Hallucinated IDs are stripped; an
  answer with no valid citation is converted into a refusal (`ungrounded`).
- **Refuse before generating** when there is no evidence or the top reranker score is
  below `RAG_MIN_RELEVANCE`; refuse after generating when the model returns the
  `INSUFFICIENT_EVIDENCE` sentinel. The refusal text is identical whatever the cause, so it
  does not reveal whether restricted documents exist. Streaming holds back tokens while the
  output could still be the sentinel.
- **Prompt-injection defence in depth**: heuristic scoring at ingestion and query time,
  `drop` (default) or `annotate` policy, delimited `<source>` elements with escaped
  attributes, a system prompt that treats sources as data, and citation validation.
  Strongly suspicious *queries* are refused (`unsafe_query`).
- **PII** is detected (regex + checksums) and redacted before chunking/embedding by default,
  so it never reaches the vector index or the model provider.
- **Semantic cache** key = (tenant, ACL fingerprint of the caller's groups, tenant corpus
  version) + embedding similarity >= 0.97. Any ingestion or deletion bumps the corpus
  version, invalidating stale answers; refusals are never cached.

## Consequences

- Higher refusal rate on genuinely ambiguous questions (tunable; tracked by the eval
  harness as `refusal_accuracy`).
- Cache hit rate is lower than a global cache, by design; correctness over hit rate.
- Heuristic injection detection is not complete; it is one layer, and the classifier slot
  is a drop-in replacement behind `InjectionDetector`.

## Alternatives considered

- **Trusting the model to cite**: unverifiable; no defence against fabricated sources.
- **Global exact-match cache**: cross-permission leakage risk.
- **LLM-based PII detection**: better recall for names/addresses, but sends raw PII to a
  model to find it; regex+checksum is the safe default with NER on the roadmap.
