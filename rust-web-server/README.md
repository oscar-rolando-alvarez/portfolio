# Rust Web Server

![CI](https://github.com/oscar-rolando-alvarez/portfolio/actions/workflows/rust-web-server.yml/badge.svg)

A production-grade asynchronous HTTP server written in Rust on top of Actix Web. It
packages the pieces most backend services end up needing (JWT authentication with
refresh-token rotation, per-client rate limiting, file uploads, real-time WebSocket and
Server-Sent Events, health probes, Prometheus metrics and OpenTelemetry tracing) into a
small, well-tested codebase that can serve as a reference or a starting point.

## The problem it solves

Teams starting a new service in Rust usually spend their first weeks wiring the same
cross-cutting concerns: configuration, auth, observability, graceful shutdown, container
image, CI. This project shows one coherent, idiomatic way to do all of that with current
crates, and proves it works with tests that run against real PostgreSQL and Redis in CI.

## Key features

- **Authentication**: registration and login with Argon2id password hashing, short-lived
  JWT access tokens and long-lived refresh tokens (stored only as SHA-256 hashes),
  audience separation so a refresh token can never be used as an access token, and
  logout that deny-lists the current access token in Redis until it expires.
- **Authorization**: role-based permissions (`admin`, `moderator`, `user`, `guest`),
  admin-only endpoints.
- **Rate limiting**: GCRA token bucket per client IP (`governor`), with `Retry-After`
  headers; health and metrics endpoints are exempt.
- **File uploads**: streaming multipart uploads with a size cap, server-generated file
  names, owner-scoped download and delete.
- **Real time**: room-based WebSocket chat (`actix-ws`) with heartbeats, and SSE with
  named broadcast channels plus periodic metrics/status streams.
- **Operations**: liveness/readiness/detailed health probes, Prometheus metrics in a
  dedicated registry, structured JSON logs (`tracing`), optional OTLP trace export,
  graceful shutdown, embedded SQL migrations, a non-root container image with a built-in
  health check command.

## Tech stack

| Area | Technology | Version |
|------|------------|---------|
| Language | Rust (edition 2024) | 1.99.1 (pinned in `rust-toolchain.toml`), MSRV 1.94 |
| HTTP framework | actix-web, actix-ws, actix-multipart, actix-cors | 4.17 / 0.4 / 0.8 / 0.7 |
| Async runtime | Tokio | 1.53 |
| Database | PostgreSQL via sqlx (rustls) | PostgreSQL 18, sqlx 0.9 |
| Cache / deny-list | Redis via redis-rs `ConnectionManager` | Redis 8, redis 1.7 |
| Auth | jsonwebtoken, argon2 | 11.1, 0.6 |
| Rate limiting | governor + dashmap | 0.10, 6.2 |
| Observability | tracing, tracing-subscriber, prometheus, OpenTelemetry OTLP | 0.1, 0.3, 0.14, 0.33 |
| Config | config + dotenvy | 0.15, 0.15 |
| Validation | validator | 0.21 |
| Tooling | rustfmt, clippy, cargo-deny, criterion | 1.99.1, 0.8 |
| Container | Debian trixie slim, non-root | `rust:1.99.1-slim-trixie` builder |

## Architecture

### Container view

```mermaid
flowchart LR
    client["Web / mobile client"]
    ops["Prometheus / OTLP collector"]

    subgraph server["rust-web-server (Actix Web)"]
        mw["Middleware: tracing, security headers, compression, CORS, metrics, rate limit"]
        public["Public routes: /api/health, /api/auth, /api/events"]
        protected["Protected routes: /api/v1 (JWT)"]
        admin["Admin routes: /admin (JWT + admin role)"]
        ws["WebSocket hub: /ws"]
        sse["SSE hub: named channels"]
    end

    pg[("PostgreSQL: users, refresh tokens, files")]
    redis[("Redis: revoked access tokens")]
    disk[("Upload volume")]

    client -->|"HTTPS / WebSocket"| mw
    mw --> public
    mw --> protected
    mw --> admin
    mw --> ws
    public --> sse
    protected --> sse
    public --> pg
    protected --> pg
    protected --> redis
    protected --> disk
    ops -->|"scrape /api/metrics"| mw
    server -.->|"OTLP/HTTP traces"| ops
```

### Login and authenticated request

```mermaid
sequenceDiagram
    autonumber
    actor C as Client
    participant A as Actix Web
    participant DB as PostgreSQL
    participant R as Redis

    C->>A: POST /api/auth/login (email, password)
    A->>DB: SELECT user by email
    A->>A: Verify Argon2id hash (blocking pool)
    A->>DB: INSERT refresh token hash
    A-->>C: access token (aud=api) + refresh token (aud=refresh)

    C->>A: GET /api/v1/user/profile (Bearer access token)
    A->>A: Verify signature, exp, nbf, iss, aud
    A->>R: EXISTS auth:revoked:{jti}
    R-->>A: 0
    A->>DB: SELECT user by id
    A-->>C: 200 profile

    C->>A: POST /api/v1/user/logout
    A->>DB: Revoke refresh tokens
    A->>R: SET auth:revoked:{jti} with TTL = remaining lifetime
    A-->>C: 200
```

### Data model

```mermaid
erDiagram
    USERS ||--o{ REFRESH_TOKENS : has
    USERS ||--o{ FILES : uploads
    USERS ||--o{ SESSIONS : owns
    USERS {
        uuid id PK
        text email UK
        text password_hash
        text_array roles
        bool is_active
        timestamptz last_login
    }
    REFRESH_TOKENS {
        uuid id PK
        uuid user_id FK
        text token_hash
        timestamptz expires_at
        bool is_revoked
    }
    FILES {
        uuid id PK
        uuid user_id FK
        text filename
        text original_name
        bigint size
        text content_type
    }
```

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health`, `/api/health/live` | - | Process is up |
| GET | `/api/health/ready` | - | Postgres and Redis reachable (503 otherwise) |
| GET | `/api/health/detailed` | - | Dependency latency, pool stats, uptime |
| GET | `/api/metrics` | - | Prometheus exposition |
| GET | `/api/system`, `/api/config` | - | Build/runtime info, non-secret config |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh` | - | Auth flows |
| GET | `/api/events/stream?channel=name` | - | SSE subscription |
| GET | `/api/events/metrics`, `/api/events/system` | - | Periodic SSE streams |
| GET | `/api/v1/user/profile` | Bearer | Current user |
| PUT | `/api/v1/user/password` | Bearer | Change password (revokes refresh tokens) |
| POST | `/api/v1/user/logout` | Bearer | Revoke tokens |
| POST | `/api/v1/upload/file` | Bearer | Multipart upload (10 MiB cap) |
| GET / DELETE | `/api/v1/upload/files/{id}` | Bearer | Download / delete own file |
| POST | `/api/v1/events/publish` | Bearer | Publish to an SSE channel |
| GET | `/admin/metrics/detailed`, `/admin/system/stats` | Bearer + admin | Operational detail |
| GET | `/ws`, `/ws/chat` | - | WebSocket chat (`join_room`, `leave_room`, `send_message`, `ping`) |

## Project structure

```
rust-web-server/
├── src/
│   ├── main.rs            # Binary: config, telemetry, HTTP server, healthcheck subcommand
│   ├── lib.rs             # AppState and route registration (used by tests)
│   ├── config.rs          # Layered configuration (defaults, TOML file, APP_* env)
│   ├── error.rs           # AppError -> HTTP status + JSON body
│   ├── telemetry.rs       # tracing subscriber, optional OTLP exporter
│   ├── handlers/          # auth, health, metrics, sse, upload, websocket
│   ├── middleware/        # JWT validator + AuthUser extractor, metrics, rate limit
│   ├── models/            # Claims, roles/permissions, request/response DTOs, rows
│   ├── routes/            # public, protected (/api/v1), admin, websocket
│   └── services/          # Postgres, Redis, Prometheus registry, password/JWT helpers
├── migrations/            # sqlx migrations, embedded into the binary
├── tests/                 # HTTP integration tests
├── benches/               # criterion micro-benchmarks
├── load-tests/            # k6 / wrk scripts for end-to-end load testing
├── k8s/                   # Example Kubernetes manifests
├── Dockerfile             # Multi-stage, non-root runtime image
└── docker-compose.yml     # API + PostgreSQL + Redis
```

## Running locally

### With Docker

```sh
cp .env.example .env            # adjust secrets
docker compose up --build
curl http://localhost:8080/api/health/ready
```

### Without Docker

Requirements: Rust (the pinned toolchain is installed automatically by `rustup`),
PostgreSQL 13+ and Redis 6+.

```sh
cp .env.example .env
docker compose up -d postgres redis   # or use your own instances
cargo run --release
```

Migrations run automatically at startup.

Quick tour:

```sh
curl -s -X POST localhost:8080/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse","first_name":"Ada","last_name":"Lovelace"}'
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse"}' | jq -r .access_token)
curl -s localhost:8080/api/v1/user/profile -H "Authorization: Bearer $TOKEN"
```

## Testing

```sh
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test                                   # unit tests + HTTP tests that need no services

# Full suite, including tests against real PostgreSQL and Redis
docker compose up -d postgres redis
APP_DATABASE__URL=postgres://postgres:postgres@localhost:5432/rust_web_server \
APP_REDIS__URL=redis://localhost:6379 \
cargo test -- --include-ignored

cargo bench                                  # criterion micro-benchmarks
cargo deny check                             # advisories, licenses, sources
```

The service-backed tests are marked `#[ignore = "requires Postgres and Redis"]` so a
plain `cargo test` works anywhere; CI always runs them with `--include-ignored` against
PostgreSQL and Redis service containers. They cover the full auth lifecycle (including
token revocation), validation errors, role checks, upload/download/delete with ownership,
readiness, metrics, SSE publishing and rate limiting.

CI (`.github/workflows/rust-web-server.yml`) runs formatting, clippy with and without
default features, the full test suite, cargo-deny, and builds the Docker image and
smoke-tests it against real PostgreSQL and Redis containers.

## Configuration

All settings can be provided as environment variables with the `APP_` prefix (nested
keys separated by `__`), in a `.env` file, or in a TOML file referenced by `CONFIG_FILE`.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_HOST` / `APP_PORT` | `0.0.0.0` / `8080` | Listen address |
| `APP_WORKERS` | number of CPUs | Actix worker threads |
| `APP_MAX_CONNECTIONS` | `25000` | Max concurrent connections per worker |
| `APP_REQUEST_TIMEOUT` | `30` | Client request header timeout (s) |
| `APP_SHUTDOWN_TIMEOUT` | `30` | Graceful shutdown drain time (s) |
| `APP_ENVIRONMENT` | `development` | `production` enforces a strong JWT secret |
| `APP_UPLOAD_DIR` / `APP_STATIC_DIR` | `./uploads` / `./static` | File storage / static assets (served at `/static` if present) |
| `APP_CORS_ALLOWED_ORIGINS` | `*` | Comma-separated origins |
| `APP_DATABASE__URL` | `postgres://postgres:postgres@localhost:5432/rust_web_server` | PostgreSQL URL |
| `APP_DATABASE__MAX_CONNECTIONS` / `__MIN_CONNECTIONS` | `20` / `2` | Pool size |
| `APP_REDIS__URL` | `redis://localhost:6379` | Redis URL |
| `APP_JWT__SECRET` | insecure placeholder | HMAC secret, at least 32 chars in production |
| `APP_JWT__EXPIRATION` / `__REFRESH_EXPIRATION` | `3600` / `604800` | Token lifetimes (s) |
| `APP_JWT__ALGORITHM` | `HS256` | `HS256`, `HS384` or `HS512` |
| `APP_RATE_LIMIT__ENABLED` | `true` | Toggle the rate limiter |
| `APP_RATE_LIMIT__REQUESTS_PER_MINUTE` / `__BURST_SIZE` | `120` / `30` | Per-IP quota |
| `APP_LOGGING__LEVEL` / `__FORMAT` | `info` / `json` | Log level and `json`, `pretty` or `compact` |
| `RUST_LOG` | - | Overrides the log filter |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | - | Enables OTLP/HTTP trace export (standard `OTEL_*` variables apply) |

## Design decisions

- **Actix Web over a rewrite to another framework**: the code base was already Actix-based
  and Actix 4 remains actively maintained and among the fastest Rust HTTP stacks, so the
  upgrade focused on correctness and current idioms (`middleware::from_fn`, `actix-ws`
  instead of the deprecated actor-based WebSockets).
- **Library plus thin binary**: all routes are registered through `configure_app`, so
  integration tests drive the real router in-process with `actix_web::test`.
- **Stateless access tokens with a small deny-list**: JWTs keep request authentication
  free of database round-trips; Redis only stores the ids of tokens revoked before expiry,
  with a TTL equal to their remaining lifetime. Validation fails closed if Redis is down.
- **Refresh tokens are hashed at rest** and bound to their user; changing the password
  revokes all of them in the same transaction.
- **Dedicated Prometheus registry** instead of the global one, so multiple app instances
  (for example in tests) never collide on metric registration.
- **CPU-bound Argon2 runs on the blocking pool** to keep the async workers responsive.
- **Server errors never leak internals**: 5xx responses carry a generic message while the
  detail goes to structured logs.
- **HTTP/1.1 in the app, HTTP/2 and TLS at the edge**: actix-web's `http2` feature is
  disabled because TLS/HTTP/2 termination belongs to the ingress or load balancer, and
  doing so removes the `h2` 0.3 line flagged by RustSec from the dependency tree.
- **Supply-chain policy as code**: `deny.toml` enforces advisories, licenses and crate
  sources. The single ignored advisory (RUSTSEC-2023-0071, `rsa`) is documented there: the
  crate is linked by jsonwebtoken but only HMAC algorithms are ever used.
- **No curl in the image**: the binary ships a `healthcheck` subcommand used by the
  Docker `HEALTHCHECK`, keeping the runtime image minimal.

## Known limitations

- The rate limiter is in-memory per instance; use a shared store (for example Redis)
  when running several replicas behind a load balancer.
- WebSocket and SSE hubs are in-process; horizontal scaling would need a pub/sub backbone
  such as Redis Streams or NATS.
- The client IP for rate limiting honours `Forwarded`/`X-Forwarded-For`; deploy behind a
  proxy that overwrites those headers.

## License

MIT
