"""FastAPI application factory."""

from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from ragplatform import __version__
from ragplatform.api.auth import Authenticator
from ragplatform.api.routes import admin, documents, query
from ragplatform.config import Settings, get_settings
from ragplatform.container import Container, build_container
from ragplatform.domain.errors import DomainError
from ragplatform.observability.telemetry import configure_logging, configure_telemetry

log = structlog.get_logger(__name__)

DESCRIPTION = """
Multi-tenant enterprise knowledge assistant.

* **Auth**: `Authorization: Bearer <JWT>` (claims `tid`, `groups`, `roles`) or `X-API-Key`.
* **Isolation**: tenant + group ACLs are enforced inside the retrieval query and by
  PostgreSQL row-level security.
* **Answers** are grounded in retrieved chunks with inline `[chunk-id]` citations, or refused.
"""


def _problem(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": f"urn:rag:error:{code}",
            "title": code,
            "status": status,
            "detail": detail,
        },
    )


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    configure_telemetry(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        c = container or build_container(settings)
        app.state.container = c
        app.state.authenticator = Authenticator(settings, c.api_keys)
        log.info("api.started", env=settings.environment, llm=settings.llm_provider.value)
        try:
            yield
        finally:
            if container is None:
                await c.aclose()

    app = FastAPI(
        title="Enterprise RAG Platform",
        version=__version__,
        description=DESCRIPTION,
        lifespan=lifespan,
    )
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "X-API-Key", "Content-Type"],
        )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        log.info(
            "http.request",
            method=request.method,
            status=response.status_code,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return _problem(exc.status, exc.code, str(exc))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        return _problem(422, "validation_error", detail)

    @app.get("/healthz", tags=["ops"], summary="Liveness")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz", tags=["ops"], summary="Readiness (database reachable)")
    async def readyz(request: Request) -> JSONResponse:
        c: Container = request.app.state.container
        ok = await c.health.ping()
        return JSONResponse(
            status_code=200 if ok else 503, content={"status": "ready" if ok else "unavailable"}
        )

    app.include_router(documents.router)
    app.include_router(query.router)
    app.include_router(admin.router)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="healthz,readyz")
    return app
