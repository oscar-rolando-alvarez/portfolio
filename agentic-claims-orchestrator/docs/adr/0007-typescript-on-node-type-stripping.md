# ADR-0007: Run TypeScript directly on Node 24 LTS (type stripping), modular monorepo

- Status: Accepted
- Date: 2026-10-17

## Context

We want strict typing end to end (domain, tool contracts, config), fast tests, and the smallest possible gap between what is reviewed and what runs in production.

## Decision

- **npm workspaces** with hexagonal boundaries: `@aco/core` (domain, runtime, policy, agents, ML scorer; no I/O), `@aco/mcp-tools` (MCP servers + gateway), `@aco/infra` (PostgreSQL, LLM HTTP adapter, OpenTelemetry, logging), `apps/server` (composition root: API, CLI, evals).
- **Node 24 LTS native type stripping**: sources use only erasable TypeScript syntax (`erasableSyntaxOnly`, `verbatimModuleSyntax`, explicit `.ts` imports). Production runs `node apps/server/src/main.ts`; `tsc --noEmit` is the type gate. No bundler, no transpiled artifacts.
- **TypeScript 6.0** (not 7.x) because `typescript-eslint` 8.x supports `<6.1`; revisit when the type-aware lint stack supports the native compiler.
- Strictest practical compiler settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and `typescript-eslint` `strictTypeChecked`.

## Consequences

- Stack traces point at real source lines; the Docker image is sources + production `node_modules`.
- Enums, namespaces and parameter properties are not allowed (by design).
- If we need to publish packages to a registry, a `tsc` emit step can be added without code changes.

## Alternatives considered

- **tsc/tsup build to `dist/`**: standard, but adds build artifacts and source-map indirection with no runtime benefit here.
- **Python (FastAPI + Pydantic)**: strong ML ecosystem; TypeScript chosen to match the requested stack and the MCP TypeScript SDK. Python is still used where it shines: offline model training (`ml/`).
