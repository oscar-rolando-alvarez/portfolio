# ADR-0005: Tokenize PII at the edges; resolve it only inside the PII-privileged tool

- Status: Accepted
- Date: 2026-10-17

## Context

FNOLs and claim documents contain names, emails, phone numbers and sometimes SSNs or card numbers. Sending them to an external LLM, writing them into an append-only audit log, or returning them from read APIs creates privacy and regulatory exposure (GDPR/CCPA data minimization, GLBA). Agents do not need raw identities to triage a claim.

## Decision

- **Edge tokenization**: on submission, claimant fields are replaced by deterministic, tenant-scoped tokens `[[pii:<kind>:<hmac16>]]` (HMAC-SHA256 with a secret) and the raw value is stored **encrypted with AES-256-GCM** in the vault (`pii_vault` table). Free text is DLP-scanned and PII spans are tokenized in place. Document bodies are stored as encrypted vault entries and the run state only carries a `contentRef`.
- **Only `document_extract` can dereference documents** (it is constructed with vault read capability). Its raw PII output is tokenized by the gateway before reaching any agent.
- **Defense in depth**: a DLP scanner (emails, phones, SSNs, Luhn-valid cards, known names) runs on every outgoing LLM prompt and every audit payload; hits are redacted and recorded as `policy.violation` events. Logs use pino redaction paths. The eval harness independently scans LLM prompts, audit events and API responses for the scenario's raw PII; the CI gate requires **zero** violations.
- Deterministic tokens allow correlation (same claimant across claims, idempotent replays) without revealing identity.

## Consequences

- The LLM provider, the audit store and API consumers never receive raw PII by construction, which simplifies DPIAs and vendor reviews.
- Key management becomes critical: in production, keys come from a KMS/secret manager (Helm `existingSecret`), with rotation implemented via key ids (roadmap).
- Regex DLP has false negatives (e.g. free-form addresses); it is a backstop, not the primary control.

## Alternatives considered

- **Redact-only (mask) without a vault**: loses the ability to correlate or to recover values for authorized workflows (payments, letters).
- **Format-preserving encryption**: tokens look like real data, which confuses DLP and humans; rejected.
- **Cloud DLP service on every prompt**: better recall, adds latency/cost and a third party processing the same PII we are trying to contain.
