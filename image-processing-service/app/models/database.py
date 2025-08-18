"""Database models using SQLAlchemy."""
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer, 
    String, Text, JSON, Index, ForeignKey
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

Base = declarative_base()


class Task(Base):
    """Task model for tracking processing jobs."""
    __tablename__ = "tasks"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    api_key = Column(String, index=True)
    task_type = Column(String, nullable=False, index=True)
    status = Column(String, default="pending", index=True)
    
    # Input data
    input_data = Column(JSON)
    input_url = Column(String)
    
    # Output data
    output_data = Column(JSON)
    output_url = Column(String)
    
    # Processing metadata
    processing_time = Column(Float)
    progress = Column(Integer, default=0)
    error_message = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now(), index=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    
    # Relationships
    metrics = relationship("TaskMetric", back_populates="task")
    
    # Indexes
    __table_args__ = (
        Index("idx_task_status_created", "status", "created_at"),
        Index("idx_task_user_status", "user_id", "status"),
    )


class TaskMetric(Base):
    """Task metrics for monitoring."""
    __tablename__ = "task_metrics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("tasks.id"), index=True)
    
    # Performance metrics
    cpu_usage = Column(Float)
    memory_usage = Column(Float)
    processing_duration = Column(Float)
    queue_time = Column(Float)
    
    # Image processing specific
    input_image_size = Column(Integer)
    output_image_size = Column(Integer)
    compression_ratio = Column(Float)
    
    # Timestamps
    recorded_at = Column(DateTime, default=func.now())
    
    # Relationships
    task = relationship("Task", back_populates="metrics")


class ApiKey(Base):
    """API key model for authentication and rate limiting."""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    key_hash = Column(String, unique=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String)
    
    # Rate limiting
    rate_limit_per_minute = Column(Integer, default=60)
    rate_limit_burst = Column(Integer, default=10)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    last_used_at = Column(DateTime)
    expires_at = Column(DateTime)
    
    # Usage statistics
    total_requests = Column(Integer, default=0)
    total_processing_time = Column(Float, default=0.0)


class RateLimitEntry(Base):
    """Rate limiting entries."""
    __tablename__ = "rate_limits"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    identifier = Column(String, index=True)  # API key or IP
    window_start = Column(DateTime, index=True)
    request_count = Column(Integer, default=0)
    
    __table_args__ = (
        Index("idx_rate_limit_window", "identifier", "window_start"),
    )


class ProcessingQueue(Base):
    """Processing queue for task management."""
    __tablename__ = "processing_queue"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, unique=True, index=True)
    priority = Column(Integer, default=5, index=True)
    queue_name = Column(String, default="default", index=True)
    
    # Retry logic
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    next_retry_at = Column(DateTime)
    
    # Worker assignment
    worker_id = Column(String, index=True)
    assigned_at = Column(DateTime)
    
    # Timestamps
    queued_at = Column(DateTime, default=func.now())
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    
    __table_args__ = (
        Index("idx_queue_priority_queued", "priority", "queued_at"),
        Index("idx_queue_worker_assigned", "worker_id", "assigned_at"),
    )


class SystemMetric(Base):
    """System-wide metrics."""
    __tablename__ = "system_metrics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    metric_name = Column(String, index=True)
    metric_value = Column(Float)
    metric_unit = Column(String)
    
    # Dimensions
    service_name = Column(String, default="image-processing-service")
    instance_id = Column(String)
    
    # Timestamp
    recorded_at = Column(DateTime, default=func.now(), index=True)
    
    __table_args__ = (
        Index("idx_metric_name_time", "metric_name", "recorded_at"),
    )