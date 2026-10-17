"""FastAPI application factory exposing the Strawberry GraphQL API."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from strawberry.fastapi import GraphQLRouter

from recommender import __version__
from recommender.cache import build_cache
from recommender.config import Settings, get_settings
from recommender.db import Database
from recommender.genai.embeddings import build_embedding_provider
from recommender.genai.vectorstore import build_vector_store
from recommender.graphql.context import get_context
from recommender.graphql.schema import build_schema
from recommender.observability import (
    RequestContextMiddleware,
    configure_logging,
    configure_tracing,
)
from recommender.recommendation.service import RecommendationService
from recommender.security import TokenService
from recommender.seed import seed_demo_catalog

logger = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, json=settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = Database(settings.database_url, echo=settings.db_echo)
        if settings.database_url.startswith("sqlite"):
            await database.create_all()  # PostgreSQL uses Alembic migrations
        if settings.seed_demo_data:
            await seed_demo_catalog(database.session_factory)
        cache = build_cache(settings.redis_url)
        service = RecommendationService(
            settings,
            database.session_factory,
            build_embedding_provider(settings),
            build_vector_store(settings),
            cache,
        )
        indexed = await service.reindex_all()
        app.state.database = database
        app.state.cache = cache
        app.state.recommendations = service
        app.state.tokens = TokenService(
            settings.jwt_secret_key.get_secret_value(),
            settings.jwt_algorithm,
            settings.access_token_expire_minutes,
        )
        logger.info(
            "app.startup",
            items_indexed=indexed,
            embeddings=service.embeddings.name,
            vector_store=settings.vector_store,
        )
        yield
        await cache.close()
        await database.close()

    app = FastAPI(
        title="GraphQL Recommendation API",
        version=__version__,
        description="Hybrid recommendations and semantic search over GraphQL.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)

    graphql_router: GraphQLRouter[object, None] = GraphQLRouter(
        build_schema(settings.graphql_max_depth),
        context_getter=get_context,
        graphql_ide="graphiql" if settings.graphql_ide else None,
    )
    app.include_router(graphql_router, prefix="/graphql")

    @app.get("/health", tags=["ops"])
    async def health() -> JSONResponse:
        db_ok = await app.state.database.ping()
        cache_ok = await app.state.cache.ping()
        healthy = db_ok and cache_ok
        return JSONResponse(
            {
                "status": "healthy" if healthy else "degraded",
                "version": __version__,
                "checks": {
                    "database": "ok" if db_ok else "unavailable",
                    "cache": "ok" if cache_ok else "unavailable",
                },
            },
            status_code=200 if healthy else 503,
        )

    @app.get("/metrics", tags=["ops"], include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    configure_tracing(app, settings.app_name)
    return app


app = create_app()
