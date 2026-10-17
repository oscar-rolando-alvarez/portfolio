# ADR-0002: Integrate enterprise systems as MCP servers behind a governed gateway

- Status: Accepted
- Date: 2026-10-17

## Context

Agents need policy administration data, claims history and document understanding. In a real insurer these are owned by different teams and change on their own schedules. We want a standard, discoverable contract that other agent hosts (assistants, IDEs, other orchestrators) can reuse, without giving agents raw network access.

## Decision

- Expose each capability as a **Model Context Protocol server** using the official TypeScript SDK v2 (`@modelcontextprotocol/server` / `client` 2.3.1): `policy-lookup`, `claims-history`, `document-extract`. Each tool declares Zod **input and output schemas** (published as JSON Schema in `tools/list`) and annotations (`readOnlyHint`, `idempotentHint`).
- Shared **tool contracts** live in `packages/core/src/tools/contracts.ts`; servers implement them and the **`McpToolGateway`** consumes them. The gateway validates input *before* the call and output *after* it, maps failures to the error taxonomy (transport = transient, tool error/contract violation = permanent), propagates W3C trace context and an idempotency key in `_meta`, and tokenizes PII from `document_extract` before returning to the agent.
- **Least privilege**: the policy file grants tools per step (`toolGrants`); the runtime refuses ungranted calls with a `policy.violation` event.
- Two transports with the same protocol: **in-process** (`InMemoryTransport`, default, zero network hops) and **stdio** (`MCP_TRANSPORT=stdio`, one process per server, credentials isolated per server).

## Consequences

- Tools are reusable by any MCP host and testable in isolation; a contract test proves a non-conforming server is rejected.
- The SDK v2 implements the 2026-07-28 spec; pinning versions and validating outputs ourselves protects us from server drift.
- In-process transport keeps the demo a single binary; stdio/HTTP deployment is a configuration change, not a code change.

## Alternatives considered

- **Direct function calls / REST clients per system**: simpler, but no discoverability, no standard schema publication, and tool governance would be ad hoc.
- **Provider-specific function calling as the integration layer**: couples tools to one LLM vendor; MCP keeps tools provider-agnostic.
- **Streamable HTTP transport now**: supported by the SDK; deferred until servers are owned by separate teams (roadmap).
