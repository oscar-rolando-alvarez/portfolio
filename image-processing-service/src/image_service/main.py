"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from image_service import __version__
from image_service.api.routes import router
from image_service.config import Settings, get_settings
from image_service.genai.vision import build_vision_analyzer
from image_service.observability import (
    RequestContextMiddleware,
    configure_logging,
    configure_tracing,
)
from image_service.storage import LocalStorage

logger = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, json=settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.storage = LocalStorage(settings.storage_dir)
        app.state.vision = build_vision_analyzer(settings)
        logger.info(
            "app.startup", vision=settings.vision_provider, storage=str(settings.storage_dir)
        )
        yield

    app = FastAPI(
        title="Image Processing Service",
        version=__version__,
        description="Image transformations, analysis and vision-model captioning.",
        lifespan=lifespan,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)
    app.include_router(router)

    @app.get("/health", tags=["ops"])
    async def health() -> JSONResponse:
        storage_ok = await app.state.storage.healthy()
        return JSONResponse(
            {
                "status": "healthy" if storage_ok else "degraded",
                "version": __version__,
                "checks": {"storage": "ok" if storage_ok else "unavailable"},
                "vision_provider": settings.vision_provider,
            },
            status_code=200 if storage_ok else 503,
        )

    @app.get("/metrics", tags=["ops"], include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    configure_tracing(app, settings.app_name)
    return app


app = create_app()
