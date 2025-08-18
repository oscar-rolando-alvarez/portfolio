"""Main FastAPI application with async endpoints."""
import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Dict, List

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import image_processing, health_checks, metrics_endpoint
from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.logging import configure_logging, get_logger, set_correlation_id
from app.core.rate_limiter import RateLimitMiddleware, rate_limiter
from app.services.message_queue import message_queue
from app.services.metrics import MetricsMiddleware, metrics_collector

# Configure logging
configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting Image Processing Service")
    
    try:
        # Initialize database
        await init_db()
        logger.info("Database initialized")
        
        # Connect to message queue
        await message_queue.connect()
        logger.info("Message queue connected")
        
        # TODO: Start worker processes
        # await start_workers()
        
        logger.info("Image Processing Service started successfully")
        
    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Image Processing Service")
    
    try:
        # Disconnect from message queue
        await message_queue.disconnect()
        logger.info("Message queue disconnected")
        
        # Close database connections
        await close_db()
        logger.info("Database connections closed")
        
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
    
    logger.info("Image Processing Service shut down complete")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Scalable Image Processing Microservice with AI capabilities",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middleware for correlation ID
class CorrelationIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        set_correlation_id(correlation_id)
        
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response

# Add middlewares
app.add_middleware(CorrelationIDMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware, rate_limiter=rate_limiter)

# Include routers
app.include_router(health_checks.router, prefix="/health", tags=["Health"])
app.include_router(metrics_endpoint.router, prefix="/metrics", tags=["Metrics"])
app.include_router(image_processing.router, prefix=settings.API_V1_STR, tags=["Image Processing"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "status": "running",
        "docs_url": "/docs" if settings.DEBUG else "disabled"
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS if not settings.DEBUG else 1,
        log_config=None  # Use our custom logging
    )