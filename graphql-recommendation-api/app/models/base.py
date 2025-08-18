"""Base database models."""
import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import Column, DateTime, String, Text, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func


class BaseModel:
    """Base model with common fields."""
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


# Base class for all models
Base = declarative_base(cls=BaseModel)