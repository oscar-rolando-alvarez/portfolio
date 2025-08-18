"""Main FastAPI application with GraphQL endpoint."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

import strawberry
import uvicorn
from fastapi import FastAPI, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from strawberry.fastapi import GraphQLRouter
from strawberry.subscriptions import GRAPHQL_WS_PROTOCOL

from app.config import settings
from app.database import init_database, close_database
from app.cache import redis_client
from app.utils import vector_db_manager
from app.auth import get_context
from app.middleware import rate_limit_middleware
from app.monitoring import metrics_collector, alert_manager
from app.api import Query, Mutation, Subscription, DataLoaderManager

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.monitoring.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting GraphQL Recommendation API")
    
    try:
        # Initialize database
        await init_database()
        logger.info("Database initialized")
        
        # Connect to Redis cluster
        await redis_client.connect()
        logger.info("Redis cluster connected")
        
        # Connect to vector database
        await vector_db_manager.connect()
        logger.info("Vector database connected")
        
        # Start background tasks
        asyncio.create_task(alert_manager.check_alerts())
        logger.info("Background tasks started")
        
        logger.info("Application startup complete")
        
        yield
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise
    
    finally:
        # Shutdown
        logger.info("Shutting down application")
        
        try:
            await close_database()
            await redis_client.disconnect()
            await vector_db_manager.disconnect()
            logger.info("Application shutdown complete")
        except Exception as e:
            logger.error(f"Shutdown error: {e}")


# Enhanced context with DataLoaders
async def get_enhanced_context(request: Request, response: Response):
    """Get enhanced GraphQL context with DataLoaders."""
    # Get base authentication context
    auth_context = await get_context(request, response)
    
    # Add DataLoaders
    auth_context.dataloaders = DataLoaderManager()
    
    return auth_context


# Create GraphQL schema
schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    subscription=Subscription
)

# Create GraphQL router
graphql_app = GraphQLRouter(
    schema,
    context_getter=get_enhanced_context,
    subscription_protocols=[GRAPHQL_WS_PROTOCOL]
)

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    debug=settings.debug,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add rate limiting middleware
app.middleware("http")(rate_limit_middleware)

# Include GraphQL router
app.include_router(graphql_app, prefix="/graphql")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "GraphQL Recommendation API",
        "version": settings.version,
        "graphql_endpoint": "/graphql",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    health_status = await metrics_collector.get_health_status()
    
    # Check component health
    components = {
        "database": "healthy",
        "redis": "healthy" if redis_client._connected else "unhealthy",
        "vector_db": "healthy",  # Add actual check
    }
    
    overall_status = "healthy"
    if any(status != "healthy" for status in components.values()):
        overall_status = "unhealthy"
    
    return {
        "status": overall_status,
        "components": components,
        "metrics": health_status,
        "timestamp": health_status["timestamp"]
    }


@app.get("/metrics")
async def metrics_endpoint():
    """Prometheus metrics endpoint."""
    if not settings.monitoring.enable_prometheus:
        return {"error": "Metrics disabled"}
    
    metrics_data = metrics_collector.get_prometheus_metrics()
    return PlainTextResponse(
        content=metrics_data,
        media_type="text/plain"
    )


@app.get("/api/metrics/summary")
async def metrics_summary():
    """API metrics summary."""
    current_metrics = await metrics_collector.get_current_metrics()
    recommendation_metrics = await metrics_collector.get_recommendation_metrics()
    
    return {
        "general": current_metrics,
        "recommendations": recommendation_metrics,
        "timestamp": current_metrics["timestamp"]
    }


@app.get("/api/recommendations/popular/{category}")
async def popular_items_api(category: str, limit: int = 20):
    """API endpoint for popular items by category."""
    # This would be used by non-GraphQL clients
    try:
        from app.cache import cache_manager
        popular_items = await cache_manager.get_popular_items(
            None,  # tenant_id would come from auth
            category,
            limit
        )
        return {"items": popular_items or []}
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/train/{algorithm}")
async def train_model_api(algorithm: str, request: Request):
    """API endpoint to trigger model training."""
    # This would be used for scheduled training jobs
    try:
        # Extract tenant from auth or request
        # For now, placeholder
        return {"message": f"Training {algorithm} model initiated"}
    except Exception as e:
        return {"error": str(e)}


# WebSocket endpoint for subscriptions is automatically handled by GraphQLRouter


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.service_host,
        port=settings.service_port,
        reload=settings.debug,
        log_level=settings.monitoring.log_level.lower(),
        workers=1 if settings.debug else 4
    )