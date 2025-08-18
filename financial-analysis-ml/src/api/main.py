"""FastAPI application main module."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from .endpoints import auth, users
from .middleware.error_handler import setup_error_handling
from .middleware.logging_middleware import setup_logging_middleware
from ..infrastructure.database.connection import get_database_config

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting up financial analysis application...")
    
    # Initialize database
    db_config = get_database_config()
    logger.info("Database connection initialized")
    
    yield
    
    # Shutdown
    logger.info("Shutting down financial analysis application...")
    
    # Close database connection
    await db_config.close()
    logger.info("Database connection closed")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title="Financial Analysis ML API",
        description="A comprehensive financial analysis system with ML capabilities",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    
    # Setup middleware
    setup_middleware(app)
    
    # Setup error handling
    setup_error_handling(app)
    
    # Setup logging
    setup_logging_middleware(app, log_level="INFO")
    
    # Include routers
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "healthy",
            "service": "financial-analysis-ml",
            "version": "1.0.0"
        }
    
    @app.get("/")
    async def root():
        """Root endpoint."""
        return {
            "message": "Financial Analysis ML API",
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/health"
        }
    
    logger.info("FastAPI application created successfully")
    return app


def setup_middleware(app: FastAPI):
    """Setup application middleware."""
    import os
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Trusted host middleware (for production)
    allowed_hosts = os.getenv("ALLOWED_HOSTS", "*").split(",")
    if allowed_hosts != ["*"]:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=allowed_hosts
        )
    
    logger.info("Middleware setup completed")


# Create the application instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )