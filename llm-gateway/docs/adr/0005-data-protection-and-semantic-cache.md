# ADR 0005: Data protection before caching and routing; tenant-scoped semantic cache

- Status: Accepted
- Date: 2026-10-17

## Context

Prompts contain customer data. Regulators (GDPR, PCI DSS, sector rules) expect
minimisation before data leaves the organisation, plus evidence of what was sent.
Prompt injection is the top risk for LLM applications. Many requests are repeats or
near-repeats (FAQ bots, agents re-asking), so caching is the biggest single cost lever,
but a cache must never leak answers across tenants or serve an answer to a different
question.

## Decision

- **Pipeline order**: authentication → injection scoring → PII redaction → budget → rate limit
  → cache → upstream. The cache key, the semantic embedding, the upstream request and the
  audit hash are all computed from the **redacted** prompt, so raw PII never reaches a
  provider, the cache or the logs.
- **PII detection** uses regexes *plus validators*: Luhn for cards, ISO 13616 mod-97 and
  per-country length for IBAN, SSA rules for US SSN, digit counts and separators for phones,
  `netip` parsing for IPs, and boundary checks so `INV-2026-000123` or `10.0.0.0.1` are not
  flagged. Each tenant chooses `redact | block | off` and which entity types apply.
  System and developer messages are operator-trusted and left untouched.
- **Response redaction** is optional per tenant. For streams it cannot run safely on
  partial chunks (an e-mail address can span two chunks), so the gateway buffers, redacts,
  then streams. This trades time-to-first-token for a guarantee and is documented.
- **Prompt-injection** detection is a heuristic, explainable rule set (override
  instructions, system-prompt exfiltration, persona jailbreaks, delimiter spoofing,
  safety bypass, encoded payloads). It normalises zero-width characters and leetspeak and
  combines weighted rules with a noisy-OR score. Each tenant chooses `block | flag | off`
  with a threshold. Rule names, never text, go to the audit log.
- **Cache**: an exact tier (SHA-256 of tenant, alias, messages and sampling parameters, in
  Redis or memory) and a **semantic** tier. The semantic tier embeds only the final user
  turn; the namespace pins tenant, alias, system prompt and all earlier turns, and a cosine
  threshold applies (default 0.92 for the lexical mock, 0.95 recommended for real
  embeddings). Tool calls and `n>1` are never cached. `Cache-Control: no-cache` bypasses the
  lookup but refreshes the entry.

## Consequences

- Positive: measurable controls. The eval suite reports PII precision/recall, leak rate,
  injection TPR/FPR, cache accuracy and the false-hit rate, with CI thresholds.
- Positive: cache hits cost zero upstream tokens, and the savings are exported as
  `llmgw_cache_savings_usd_total`.
- Negative: regex PII detection misses free-text identifiers (names, addresses). An NER
  model adapter behind the same `Redact` contract is on the roadmap.
- Negative: heuristics can be evaded by novel attacks. They are a cheap first layer meant to
  sit in front of model-side defences and least-privilege tool design, not to replace them.
- Negative: the semantic index is in-memory per replica (brute-force cosine, about 0.1 ms
  per 1k vectors). The cached responses themselves are shared via Redis. Past about
  10^4 vectors per namespace, move to HNSW or Redis/Valkey vector search.

## Alternatives considered

- **An external DLP/guardrail service on every request**: more coverage, but 50 to 300 ms
  of extra latency and a new data processor. It can be added later as an adapter for
  high-risk tenants.
- **Caching raw prompts**: higher hit rates across redaction variants, but it would store
  PII. Rejected.
- **A global (cross-tenant) semantic cache**: better hit rates, unacceptable leakage risk.
