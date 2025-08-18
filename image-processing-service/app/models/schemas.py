"""Pydantic models for request/response schemas."""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, validator


class ProcessingStatus(str, Enum):
    """Processing status enumeration."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImageFormat(str, Enum):
    """Supported image formats."""
    JPEG = "jpeg"
    PNG = "png"
    WEBP = "webp"
    BMP = "bmp"
    TIFF = "tiff"


class FilterType(str, Enum):
    """Available image filters."""
    BLUR = "blur"
    SHARPEN = "sharpen"
    EDGE_DETECTION = "edge_detection"
    GAUSSIAN_BLUR = "gaussian_blur"
    MEDIAN_FILTER = "median_filter"
    EMBOSS = "emboss"
    CONTOUR = "contour"


# Base models
class BaseResponse(BaseModel):
    """Base response model."""
    success: bool = True
    message: str = "Operation completed successfully"
    correlation_id: Optional[str] = None


# Image processing requests
class ImageProcessingRequest(BaseModel):
    """Base image processing request."""
    image_url: Optional[str] = None
    output_format: ImageFormat = ImageFormat.JPEG
    quality: int = Field(default=85, ge=1, le=100)
    

class ResizeRequest(ImageProcessingRequest):
    """Image resize request."""
    width: int = Field(..., gt=0, le=4096)
    height: int = Field(..., gt=0, le=4096)
    maintain_aspect_ratio: bool = True


class CropRequest(ImageProcessingRequest):
    """Image crop request."""
    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)


class FilterRequest(ImageProcessingRequest):
    """Image filter request."""
    filter_type: FilterType
    intensity: float = Field(default=1.0, ge=0.1, le=3.0)


class OCRRequest(BaseModel):
    """OCR text extraction request."""
    image_url: Optional[str] = None
    languages: List[str] = Field(default=["eng"])
    detect_orientation: bool = True
    extract_confidence: bool = True


class ObjectDetectionRequest(BaseModel):
    """Object detection request."""
    image_url: Optional[str] = None
    confidence_threshold: float = Field(default=0.5, ge=0.1, le=1.0)
    max_detections: int = Field(default=100, ge=1, le=1000)
    classes_filter: Optional[List[str]] = None


# Response models
class ImageProcessingResponse(BaseResponse):
    """Image processing response."""
    task_id: str
    status: ProcessingStatus
    result_url: Optional[str] = None
    processing_time: Optional[float] = None


class BoundingBox(BaseModel):
    """Bounding box coordinates."""
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


class DetectedObject(BaseModel):
    """Detected object information."""
    class_name: str
    confidence: float
    bbox: BoundingBox


class ObjectDetectionResponse(BaseResponse):
    """Object detection response."""
    task_id: str
    objects: List[DetectedObject]
    processing_time: float
    image_url: Optional[str] = None


class OCRResult(BaseModel):
    """OCR text extraction result."""
    text: str
    confidence: Optional[float] = None
    bbox: Optional[BoundingBox] = None


class OCRResponse(BaseResponse):
    """OCR response."""
    task_id: str
    results: List[OCRResult]
    processing_time: float
    detected_language: Optional[str] = None


class TaskStatus(BaseModel):
    """Task status information."""
    task_id: str
    status: ProcessingStatus
    created_at: datetime
    updated_at: datetime
    progress: int = Field(default=0, ge=0, le=100)
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


# Health check models
class HealthCheck(BaseModel):
    """Health check response."""
    status: str = "healthy"
    timestamp: datetime
    version: str
    uptime: float
    dependencies: Dict[str, str] = {}


class MetricsResponse(BaseModel):
    """Metrics response."""
    total_requests: int
    active_tasks: int
    completed_tasks: int
    failed_tasks: int
    average_processing_time: float
    memory_usage: float
    cpu_usage: float


# Error models
class ErrorResponse(BaseModel):
    """Error response model."""
    success: bool = False
    error_code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    correlation_id: Optional[str] = None


# Batch processing
class BatchProcessingRequest(BaseModel):
    """Batch processing request."""
    image_urls: List[str] = Field(..., min_items=1, max_items=100)
    operations: List[Dict[str, Any]]
    callback_url: Optional[str] = None


class BatchProcessingResponse(BaseResponse):
    """Batch processing response."""
    batch_id: str
    task_ids: List[str]
    total_tasks: int
    estimated_completion_time: Optional[datetime] = None


# Configuration models
class RateLimitConfig(BaseModel):
    """Rate limit configuration."""
    requests_per_minute: int = 60
    burst_limit: int = 10
    api_key: Optional[str] = None


class ProcessingConfig(BaseModel):
    """Processing configuration."""
    max_file_size_mb: int = 50
    timeout_seconds: int = 300
    retry_attempts: int = 3
    enable_cache: bool = True