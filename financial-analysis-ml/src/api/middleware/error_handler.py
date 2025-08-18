"""Error handling middleware."""
import logging
import traceback
from typing import Union
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from ...domain.exceptions.base import (
    DomainException,
    ValidationException,
    BusinessRuleException,
    EntityNotFoundException,
    EntityAlreadyExistsException,
    UnauthorizedException,
    InsufficientPermissionsException,
)

logger = logging.getLogger(__name__)


class ErrorHandlerMiddleware:
    """Middleware for handling application errors."""
    
    def __init__(self, app: FastAPI):
        self.app = app
        self.setup_exception_handlers()
    
    def setup_exception_handlers(self):
        """Setup exception handlers for the FastAPI app."""
        
        @self.app.exception_handler(DomainException)
        async def domain_exception_handler(request: Request, exc: DomainException):
            """Handle domain exceptions."""
            logger.warning(f"Domain exception: {exc.message}")
            
            # Map domain exceptions to HTTP status codes
            status_code = self._get_status_code_for_domain_exception(exc)
            
            return JSONResponse(
                status_code=status_code,
                content={
                    "error": {
                        "type": exc.__class__.__name__,
                        "code": exc.code,
                        "message": exc.message,
                        "details": None
                    }
                }
            )
        
        @self.app.exception_handler(RequestValidationError)
        async def validation_exception_handler(request: Request, exc: RequestValidationError):
            """Handle request validation errors."""
            logger.warning(f"Validation error: {exc.errors()}")
            
            return JSONResponse(
                status_code=422,
                content={
                    "error": {
                        "type": "ValidationError",
                        "code": "VALIDATION_ERROR",
                        "message": "Request validation failed",
                        "details": exc.errors()
                    }
                }
            )
        
        @self.app.exception_handler(HTTPException)
        async def http_exception_handler(request: Request, exc: HTTPException):
            """Handle HTTP exceptions."""
            logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
            
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error": {
                        "type": "HTTPException",
                        "code": f"HTTP_{exc.status_code}",
                        "message": exc.detail,
                        "details": None
                    }
                },
                headers=getattr(exc, "headers", None)
            )
        
        @self.app.exception_handler(StarletteHTTPException)
        async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
            """Handle Starlette HTTP exceptions."""
            logger.warning(f"Starlette HTTP exception: {exc.status_code} - {exc.detail}")
            
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error": {
                        "type": "HTTPException",
                        "code": f"HTTP_{exc.status_code}",
                        "message": exc.detail,
                        "details": None
                    }
                }
            )
        
        @self.app.exception_handler(Exception)
        async def general_exception_handler(request: Request, exc: Exception):
            """Handle all other exceptions."""
            logger.error(f"Unhandled exception: {exc}", exc_info=True)
            
            # In development, include traceback
            import os
            include_traceback = os.getenv("DEBUG", "false").lower() == "true"
            
            error_details = None
            if include_traceback:
                error_details = {
                    "traceback": traceback.format_exc().split("\n")
                }
            
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "type": "InternalServerError",
                        "code": "INTERNAL_SERVER_ERROR",
                        "message": "An internal server error occurred",
                        "details": error_details
                    }
                }
            )
    
    def _get_status_code_for_domain_exception(self, exc: DomainException) -> int:
        """Map domain exceptions to HTTP status codes."""
        if isinstance(exc, ValidationException):
            return 400
        elif isinstance(exc, BusinessRuleException):
            return 400
        elif isinstance(exc, EntityNotFoundException):
            return 404
        elif isinstance(exc, EntityAlreadyExistsException):
            return 409
        elif isinstance(exc, UnauthorizedException):
            return 401
        elif isinstance(exc, InsufficientPermissionsException):
            return 403
        else:
            return 500


def setup_error_handling(app: FastAPI):
    """Setup error handling for the FastAPI application."""
    ErrorHandlerMiddleware(app)