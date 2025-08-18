"""Structured logging configuration with correlation IDs."""
import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Any, Dict, Optional

import structlog
from pythonjsonlogger import jsonlogger

from .config import settings

# Context variable for correlation ID
correlation_id: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> str:
    """Get or generate correlation ID."""
    cid = correlation_id.get()
    if not cid:
        cid = str(uuid.uuid4())
        correlation_id.set(cid)
    return cid


def set_correlation_id(cid: str) -> None:
    """Set correlation ID."""
    correlation_id.set(cid)


class CorrelationProcessor:
    """Processor to add correlation ID to log records."""
    
    def __call__(self, logger, method_name, event_dict):
        event_dict["correlation_id"] = get_correlation_id()
        return event_dict


class CustomJSONFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with correlation ID."""
    
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record["correlation_id"] = get_correlation_id()
        log_record["service"] = settings.APP_NAME
        log_record["version"] = settings.VERSION


def configure_logging():
    """Configure structured logging."""
    if settings.LOG_FORMAT == "json":
        # Configure standard library logging
        handler = logging.StreamHandler(sys.stdout)
        formatter = CustomJSONFormatter(
            "%(asctime)s %(name)s %(levelname)s %(message)s"
        )
        handler.setFormatter(formatter)
        
        # Configure root logger
        logging.basicConfig(
            level=getattr(logging, settings.LOG_LEVEL.upper()),
            handlers=[handler],
            format="%(message)s"
        )
        
        # Configure structlog
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                CorrelationProcessor(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.processors.JSONRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )
    else:
        # Simple console logging for development
        logging.basicConfig(
            level=getattr(logging, settings.LOG_LEVEL.upper()),
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[logging.StreamHandler(sys.stdout)]
        )
        
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                CorrelationProcessor(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.dev.ConsoleRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )


def get_logger(name: str) -> structlog.BoundLogger:
    """Get a structured logger."""
    return structlog.get_logger(name)