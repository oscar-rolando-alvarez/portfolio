# SocialConnect (social-media-platform)

![CI](https://github.com/oscar-rolando-alvarez/portfolio/actions/workflows/social-media-platform.yml/badge.svg)

A full-stack social network built with **Nuxt 4**, **Prisma 7** and **PostgreSQL**: a ranked home feed, follows, likes, comments, real-time direct messages and notifications over WebSockets, and pluggable content moderation that can use any OpenAI-compatible LLM endpoint.

## Problem it solves

Community products need the same core loop (post, react, follow, message) to be fast, safe and cheap to run. SocialConnect shows how far a single Nuxt deployment plus Postgres can go: server-rendered pages, a typed API, real-time delivery without a separate socket server, and moderation that works offline by default and can be upgraded to an LLM by configuration alone.

## Key features

- **Ranked home feed**: recent visible posts are scored by engagement (comments weigh double), author affinity (people you follow, and yourself) and Hacker News style time decay, then paginated.
- **Posts** with optional HTTPS image URLs and `PUBLIC` / `FOLLOWERS` visibility; likes, threaded comment list, reporting.
- **Social graph**: follow/unfollow, profile pages with counters, "who to follow" suggestions.
- **Direct messages** delivered live over a Nitro WebSocket (`/_ws`), with unread badges and duplicate-safe client state.
- **Notifications** for likes, comments and follows, pushed in real time.
- **Content moderation port**: `keyword` (default, offline), `llm` (any OpenAI-compatible chat completions API in JSON mode: a hosted provider, a LiteLLM proxy, vLLM or a local Ollama) or `none`. Flagged posts are hidden from everyone but the author. The LLM adapter fails open to the keyword check, so posting never depends on an external service.
- **Secure auth**: bcrypt (cost 12) hashes, 15-minute access JWTs plus revocable 30-day refresh tokens stored only as SHA-256 hashes, all in httpOnly cookies; expired access tokens are renewed transparently, including during SSR.
- **Operations**: `/api/health` with a database check, structured JSON request logs, versioned Prisma migrations, non-root Docker images and a one-shot migration container.

## Tech stack

| Layer | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js (LTS) | 24 |
| Framework | Nuxt (SSR, Nitro server, WebSocket support) | 4.6 |
| UI | Vue, Nuxt UI, Tailwind CSS | 3.5 / 4.12 / 4.3 |
| State | Pinia (setup stores) | 4.1 |
| ORM | Prisma ORM with `prisma-client` generator and `@prisma/adapter-pg` | 7.10 |
| Database | PostgreSQL | 18 |
| Validation | Zod (shared by forms and API) | 4.6 |
| Auth | jose (JWT), bcryptjs | 6.2 / 3.0 |
| Language | TypeScript (strict, `vue-tsc`) | 6.0 |
| Tests | Vitest, @nuxt/test-utils, Vue Test Utils, happy-dom | 5.0 / 4.3 / 2.5 / 21 |
| Lint | ESLint flat config via @nuxt/eslint | 10 / 1.17 |

## Architecture

### Context and containers

```mermaid
flowchart LR
  user["User<br/>(browser / PWA)"]
  llm["OpenAI-compatible LLM endpoint<br/>(optional)"]
  subgraph nuxt["Nuxt 4 application (Node 24)"]
    direction TB
    web["Vue 3 SSR + SPA<br/>Pinia stores"]
    api["Nitro REST API<br/>/api/*"]
    ws["Nitro WebSocket<br/>/_ws"]
    mod["Moderation port<br/>keyword / llm / none"]
    realtime["Realtime hub<br/>peers by user id"]
  end
  db[("PostgreSQL 18<br/>Prisma 7 + pg adapter")]

  user -- "HTTPS + httpOnly cookies" --> web
  user -- "WebSocket" --> ws
  web -- "useRequestFetch / $fetch" --> api
  api --> db
  api --> mod
  mod -. "JSON-mode chat completion" .-> llm
  api -- "publish events" --> realtime
  ws --- realtime
```

### Key flow: sending a direct message

```mermaid
sequenceDiagram
  autonumber
  actor A as Alice (browser)
  participant API as POST /api/conversations/:id/messages
  participant DB as PostgreSQL
  participant Hub as Realtime hub
  actor B as Bob (browser, connected to /_ws)

  A->>API: { content } + access cookie
  API->>API: auth middleware verifies JWT (renews it from refresh cookie if expired)
  API->>DB: check participant, then transaction: insert message, read participants, bump lastMessageAt
  DB-->>API: message + participants
  API->>Hub: publish { type: "message" } to participant user ids
  Hub-->>B: WebSocket frame
  B->>B: inbox store appends message, marks conversation unread
  API-->>A: 201 MessageDTO
```

### Data model (core tables)

```mermaid
erDiagram
  USER ||--o{ POST : writes
  USER ||--o{ COMMENT : writes
  USER ||--o{ LIKE : gives
  POST ||--o{ COMMENT : has
  POST ||--o{ LIKE : receives
  POST ||--o{ REPORT : "reported in"
  USER ||--o{ FOLLOW : "follower"
  USER ||--o{ FOLLOW : "followed"
  USER ||--o{ REFRESH_TOKEN : "sessions"
  CONVERSATION ||--o{ CONVERSATION_PARTICIPANT : includes
  USER ||--o{ CONVERSATION_PARTICIPANT : joins
  CONVERSATION ||--o{ MESSAGE : contains
  USER ||--o{ NOTIFICATION : receives
  POST {
    string id
    string content
    string visibility "PUBLIC | FOLLOWERS"
    string moderation "APPROVED | FLAGGED"
    datetime createdAt
  }
  REFRESH_TOKEN {
    string tokenHash "SHA-256, unique"
    datetime expiresAt
    datetime revokedAt
  }
```

The full schema is in `prisma/schema.prisma`; migrations are in `prisma/migrations/`.

## Project structure

```text
social-media-platform/
├── app/                     # Nuxt 4 app directory
│   ├── components/          # post/PostCard, post/PostComposer, WhoToFollow
│   ├── layouts/             # default (top nav with unread badges) and auth
│   ├── middleware/          # auth / guest route guards
│   ├── pages/               # feed, u/[username], messages, notifications, auth/*
│   ├── plugins/             # realtime.client.ts (WebSocket with backoff)
│   └── stores/              # Pinia: auth, posts, inbox
├── server/
│   ├── api/                 # REST handlers (auth, posts, users, conversations, notifications, health)
│   ├── middleware/auth.ts   # resolves the caller from cookies / Bearer token
│   ├── routes/_ws.ts        # WebSocket endpoint
│   ├── plugins/             # structured request logging
│   └── utils/               # prisma, session/tokens, ranking, moderation, realtime, mappers
├── shared/                  # DTO types and Zod schemas used by app and server
├── prisma/                  # schema, migrations, seed
├── scripts/smoke-test.sh    # end-to-end API + SSR smoke test (used in CI)
├── test/
│   ├── unit/                # ranking, moderation adapters, tokens, validation
│   └── nuxt/                # PostCard component, posts and inbox stores
├── prisma.config.ts
├── Dockerfile               # build / migrate / runtime targets
└── docker-compose.yml       # postgres + migrate job + app
```

## Running locally

Prerequisites: Node.js 24 LTS, npm 10+, and PostgreSQL 16+ (or Docker for the database).

```bash
cd social-media-platform
cp .env.example .env                 # adjust DATABASE_URL if needed
docker compose up -d db              # or use your own Postgres
npm install                          # also runs `prisma generate` and `nuxt prepare`
npm run db:deploy                    # apply migrations
npm run db:seed                      # demo users: alice, bob, carol, dave / Password123
npm run dev                          # http://localhost:3000
```

### Full stack with Docker

```bash
cd social-media-platform
export NUXT_JWT_SECRET="$(openssl rand -base64 48)"
docker compose up --build            # db -> migrate (one-shot) -> app on http://localhost:3000
```

To load demo data into the containerised database, run `DATABASE_URL=postgresql://social:social@localhost:5432/socialconnect npm run db:seed` from the host.

### Enabling LLM moderation

```bash
NUXT_MODERATION_PROVIDER=llm
NUXT_MODERATION_BASE_URL=http://localhost:11434/v1   # any OpenAI-compatible endpoint
NUXT_MODERATION_MODEL=llama3.1                       # model name understood by that endpoint
NUXT_MODERATION_API_KEY=                             # if the endpoint requires one
```

## Testing and quality

```bash
npm run lint           # ESLint flat config (@nuxt/eslint)
npm run typecheck      # vue-tsc across app, server and shared
npm test               # Vitest: unit + Nuxt component/store projects (no database needed)
npm run test:coverage
npm run build && npm start   # then, with a migrated and seeded DB:
./scripts/smoke-test.sh      # register, follow, feed, post, like, comment, moderation, DM, SSR, logout
```

CI (`.github/workflows/social-media-platform.yml`) runs against a PostgreSQL 18 service container: lint, typecheck, unit/component tests with coverage, `prisma migrate deploy` plus a schema drift check, seeding, a production build and the end-to-end smoke test. A second job builds both Docker targets and brings up the Compose stack until the health check passes. `npm audit` runs as an advisory job because the remaining high-severity findings are in Nuxt/Nitro build-time tooling with no patched release yet.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | none | PostgreSQL connection string, used by the app and the Prisma CLI (`NUXT_DATABASE_URL` overrides it for the app). |
| `NUXT_JWT_SECRET` | dev-only fallback | HS256 secret for access tokens. **Required** in production. |
| `NUXT_ACCESS_TOKEN_TTL` | `900` | Access token lifetime (seconds). |
| `NUXT_REFRESH_TOKEN_TTL` | `2592000` | Refresh token lifetime (seconds). |
| `NUXT_COOKIE_SECURE` | `true` | Set to `false` only for plain HTTP on a non-localhost host. |
| `NUXT_MODERATION_PROVIDER` | `keyword` | `none`, `keyword` or `llm`. |
| `NUXT_MODERATION_BASE_URL` | empty | OpenAI-compatible base URL (for `llm`). |
| `NUXT_MODERATION_MODEL` | empty | Model name (for `llm`). |
| `NUXT_MODERATION_API_KEY` | empty | Optional bearer token (for `llm`). |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Listener for the production server. |

## Design decisions

- **One Nuxt deployable instead of separate SPA, API and socket servers.** Nitro serves SSR pages, REST endpoints and WebSockets from the same process, which keeps auth (one cookie) and deployment (one image) simple. The realtime hub is an in-process map behind three functions, so moving to Redis or Postgres `LISTEN/NOTIFY` for multiple replicas is a contained change.
- **Prisma 7 with the `pg` driver adapter and a generated TypeScript client.** No native query-engine binary to ship, and the client is bundled by Nitro, so the runtime image only contains `.output/`. Migrations are SQL files reviewed in Git and applied by a dedicated container.
- **Short-lived access JWT plus hashed, revocable refresh token.** Access checks are stateless; logout and compromise response are handled by revoking the refresh row. Renewal happens in server middleware, so both API calls and SSR keep working when the access token expires.
- **Ranking in application code.** The scoring function is pure and unit-tested; candidates come from one indexed query over a 14-day window. This is the right trade-off at this scale and leaves room for a materialised score later.
- **Moderation as a port with an offline default.** The LLM path is optional, vendor-neutral (OpenAI-compatible JSON mode) and fails open to the keyword filter, so tests and local development never need network access or credentials.
- **Shared Zod schemas.** The same schemas validate forms in the browser and request bodies on the server, so error messages and limits cannot drift.

## License

MIT
