"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from financial_analysis import __version__
from financial_analysis.api.endpoints import analysis, auth, users
from financial_analysis.api.middleware.error_handler import setup_error_handling
from financial_analysis.api.middleware.logging_middleware import setup_logging_middleware
from financial_analysis.config import Settings, get_settings
from financial_analysis.genai.factory import build_narrator
from financial_analysis.infrastructure.database.connection import Database
from financial_analysis.observability import configure_logging, configure_tracing

logger = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the application. Pass `settings` to override configuration (tests)."""
    settings = settings or get_settings()
    configure_logging(settings.log_level, json=settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = Database(settings.database_url, echo=settings.db_echo)
        if settings.database_url.startswith("sqlite"):
            await database.create_all()
        app.state.database = database
        app.state.narrator = build_narrator(settings)
        logger.info("app.startup", environment=settings.environment, llm=settings.llm_provider)
        yield
        await database.close()
        logger.info("app.shutdown")

    app = FastAPI(
        title="Financial Analysis ML API",
        description="Portfolio risk analytics with optional LLM-generated narrative reports.",
        version=__version__,
        lifespan=lifespan,
    )
    app.dependency_overrides[get_settings] = lambda: settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    setup_error_handling(app)
    setup_logging_middleware(app)

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(analysis.router, prefix="/api/v1")

    @app.get("/health", tags=["Health"])
    async def health() -> JSONResponse:
        db_ok = await app.state.database.ping()
        body = {
            "status": "healthy" if db_ok else "degraded",
            "service": settings.app_name,
            "version": __version__,
            "checks": {"database": "ok" if db_ok else "unavailable"},
            "llm_provider": settings.llm_provider,
        }
        return JSONResponse(body, status_code=200 if db_ok else 503)

    @app.get("/", tags=["Health"])
    async def root() -> dict[str, str]:
        return {"service": settings.app_name, "docs": "/docs", "health": "/health"}

    configure_tracing(app, settings.app_name)
    return app


app = create_app()
