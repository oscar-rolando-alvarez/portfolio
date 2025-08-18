"""Logging middleware for request/response tracking."""
import time
import logging
import uuid
from typing import Callable
from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging HTTP requests and responses."""
    
    def __init__(self, app: FastAPI, log_level: str = "INFO"):
        super().__init__(app)
        self.log_level = getattr(logging, log_level.upper())
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log details."""
        # Generate request ID
        request_id = str(uuid.uuid4())
        
        # Add request ID to request state
        request.state.request_id = request_id
        
        # Log request
        start_time = time.time()
        
        # Get client IP
        client_ip = self._get_client_ip(request)
        
        # Log request details
        logger.log(
            self.log_level,
            f"Request started - ID: {request_id} | "
            f"Method: {request.method} | "
            f"URL: {request.url} | "
            f"Client IP: {client_ip} | "
            f"User-Agent: {request.headers.get('user-agent', 'Unknown')}"
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate processing time
            process_time = time.time() - start_time
            
            # Log response
            logger.log(
                self.log_level,
                f"Request completed - ID: {request_id} | "
                f"Status: {response.status_code} | "
                f"Processing time: {process_time:.3f}s"
            )
            
            # Add custom headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = f"{process_time:.3f}"
            
            return response
        
        except Exception as e:
            # Calculate processing time
            process_time = time.time() - start_time
            
            # Log error
            logger.error(
                f"Request failed - ID: {request_id} | "
                f"Error: {str(e)} | "
                f"Processing time: {process_time:.3f}s",
                exc_info=True
            )
            
            # Re-raise the exception
            raise
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request."""
        # Check for forwarded headers (when behind proxy/load balancer)
        x_forwarded_for = request.headers.get("X-Forwarded-For")
        if x_forwarded_for:
            # Take the first IP in the chain
            return x_forwarded_for.split(",")[0].strip()
        
        x_real_ip = request.headers.get("X-Real-IP")
        if x_real_ip:
            return x_real_ip
        
        # Fallback to direct client IP
        return request.client.host if request.client else "Unknown"


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Middleware for correlation ID tracking across services."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add correlation ID to request context."""
        # Get correlation ID from header or generate new one
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        
        # Add to request state
        request.state.correlation_id = correlation_id
        
        # Process request
        response = await call_next(request)
        
        # Add correlation ID to response headers
        response.headers["X-Correlation-ID"] = correlation_id
        
        return response


def setup_logging_middleware(app: FastAPI, log_level: str = "INFO"):
    """Setup logging middleware for the FastAPI application."""
    app.add_middleware(LoggingMiddleware, log_level=log_level)
    app.add_middleware(CorrelationIdMiddleware)