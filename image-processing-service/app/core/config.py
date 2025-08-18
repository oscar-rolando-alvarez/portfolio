"""Core configuration settings for the image processing service."""
import os
from typing import List, Optional
from pydantic import BaseSettings, validator


class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    APP_NAME: str = "Image Processing Service"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALGORITHM: str = "HS256"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/imageprocessing"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_PASSWORD: Optional[str] = None
    
    # RabbitMQ
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672/"
    
    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_TOPIC_PREFIX: str = "image-processing"
    
    # S3/MinIO
    S3_ENDPOINT_URL: Optional[str] = "http://localhost:9000"
    S3_ACCESS_KEY_ID: str = "minioadmin"
    S3_SECRET_ACCESS_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "image-processing"
    S3_REGION: str = "us-east-1"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10
    
    # Image Processing
    MAX_IMAGE_SIZE_MB: int = 50
    SUPPORTED_FORMATS: List[str] = ["jpg", "jpeg", "png", "bmp", "tiff", "webp"]
    MAX_WORKERS: int = 4
    PROCESSING_TIMEOUT: int = 300  # seconds
    
    # OCR
    TESSERACT_CMD: Optional[str] = None  # Will use system default
    OCR_LANGUAGES: List[str] = ["eng", "spa", "fra", "deu"]
    
    # Object Detection
    YOLO_MODEL_PATH: str = "yolov8n.pt"
    DETECTION_CONFIDENCE: float = 0.5
    
    # Monitoring
    PROMETHEUS_METRICS_PATH: str = "/metrics"
    ENABLE_METRICS: bool = True
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    ENABLE_CORRELATION_ID: bool = True
    
    # Circuit Breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 60
    CIRCUIT_BREAKER_EXPECTED_EXCEPTION: tuple = (Exception,)
    
    # Health Check
    HEALTH_CHECK_INTERVAL: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()