"""Application settings and configuration."""
import os
import logging
from typing import Optional, List
from pydantic import BaseSettings, Field, validator
from functools import lru_cache


class DatabaseSettings(BaseSettings):
    """Database configuration."""
    
    host: str = Field(default="localhost", env="POSTGRES_HOST")
    port: int = Field(default=5432, env="POSTGRES_PORT")
    user: str = Field(default="postgres", env="POSTGRES_USER")
    password: str = Field(default="postgres", env="POSTGRES_PASSWORD")
    database: str = Field(default="financial_analysis", env="POSTGRES_DB")
    
    # Connection pool settings
    pool_size: int = Field(default=5, env="DB_POOL_SIZE")
    max_overflow: int = Field(default=10, env="DB_MAX_OVERFLOW")
    pool_pre_ping: bool = Field(default=True, env="DB_POOL_PRE_PING")
    pool_recycle: int = Field(default=3600, env="DB_POOL_RECYCLE")
    
    echo: bool = Field(default=False, env="DB_ECHO")
    
    @property
    def url(self) -> str:
        """Get database URL."""
        return f"postgresql+asyncpg://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"
    
    @property
    def sync_url(self) -> str:
        """Get synchronous database URL for Alembic."""
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


class RedisSettings(BaseSettings):
    """Redis configuration."""
    
    url: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")
    encoding: str = Field(default="utf-8", env="REDIS_ENCODING")
    decode_responses: bool = Field(default=True, env="REDIS_DECODE_RESPONSES")
    
    # Cache settings
    default_ttl: int = Field(default=3600, env="REDIS_DEFAULT_TTL")  # 1 hour
    max_connections: int = Field(default=10, env="REDIS_MAX_CONNECTIONS")


class CelerySettings(BaseSettings):
    """Celery configuration."""
    
    broker_url: str = Field(default="redis://localhost:6379/1", env="CELERY_BROKER_URL")
    result_backend: str = Field(default="redis://localhost:6379/1", env="CELERY_RESULT_BACKEND")
    
    # Task settings
    task_serializer: str = Field(default="json", env="CELERY_TASK_SERIALIZER")
    result_serializer: str = Field(default="json", env="CELERY_RESULT_SERIALIZER")
    accept_content: List[str] = Field(default=["json"], env="CELERY_ACCEPT_CONTENT")
    timezone: str = Field(default="UTC", env="CELERY_TIMEZONE")
    enable_utc: bool = Field(default=True, env="CELERY_ENABLE_UTC")
    
    # Worker settings
    worker_prefetch_multiplier: int = Field(default=1, env="CELERY_WORKER_PREFETCH_MULTIPLIER")
    task_acks_late: bool = Field(default=True, env="CELERY_TASK_ACKS_LATE")
    worker_max_tasks_per_child: int = Field(default=1000, env="CELERY_WORKER_MAX_TASKS_PER_CHILD")
    
    # Retry settings
    task_retry_delay: int = Field(default=60, env="CELERY_TASK_RETRY_DELAY")
    task_max_retries: int = Field(default=3, env="CELERY_TASK_MAX_RETRIES")
    
    # Result settings
    result_expires: int = Field(default=3600, env="CELERY_RESULT_EXPIRES")  # 1 hour


class SecuritySettings(BaseSettings):
    """Security configuration."""
    
    # JWT settings
    jwt_secret_key: str = Field(..., env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, env="REFRESH_TOKEN_EXPIRE_DAYS")
    
    # CORS settings
    allowed_origins: List[str] = Field(default=["*"], env="ALLOWED_ORIGINS")
    allowed_hosts: List[str] = Field(default=["*"], env="ALLOWED_HOSTS")
    
    # Rate limiting
    rate_limit_enabled: bool = Field(default=True, env="RATE_LIMIT_ENABLED")
    rate_limit_requests: int = Field(default=100, env="RATE_LIMIT_REQUESTS")
    rate_limit_window: int = Field(default=60, env="RATE_LIMIT_WINDOW")  # seconds
    
    @validator('allowed_origins', 'allowed_hosts', pre=True)
    def split_string_list(cls, v):
        """Split comma-separated string into list."""
        if isinstance(v, str):
            return [item.strip() for item in v.split(',') if item.strip()]
        return v


class MLSettings(BaseSettings):
    """Machine Learning configuration."""
    
    # Model storage
    model_storage_path: str = Field(default="./models", env="ML_MODEL_STORAGE_PATH")
    
    # Training settings
    default_train_test_split: float = Field(default=0.8, env="ML_DEFAULT_TRAIN_TEST_SPLIT")
    default_validation_split: float = Field(default=0.2, env="ML_DEFAULT_VALIDATION_SPLIT")
    
    # LSTM model defaults
    lstm_sequence_length: int = Field(default=60, env="ML_LSTM_SEQUENCE_LENGTH")
    lstm_units: List[int] = Field(default=[50, 50], env="ML_LSTM_UNITS")
    lstm_dropout_rate: float = Field(default=0.2, env="ML_LSTM_DROPOUT_RATE")
    lstm_learning_rate: float = Field(default=0.001, env="ML_LSTM_LEARNING_RATE")
    
    # Training resources
    max_epochs: int = Field(default=100, env="ML_MAX_EPOCHS")
    batch_size: int = Field(default=32, env="ML_BATCH_SIZE")
    early_stopping_patience: int = Field(default=10, env="ML_EARLY_STOPPING_PATIENCE")
    
    @validator('lstm_units', pre=True)
    def parse_lstm_units(cls, v):
        """Parse LSTM units from string or return as-is."""
        if isinstance(v, str):
            return [int(x.strip()) for x in v.split(',')]
        return v


class LoggingSettings(BaseSettings):
    """Logging configuration."""
    
    level: str = Field(default="INFO", env="LOG_LEVEL")
    format: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        env="LOG_FORMAT"
    )
    
    # File logging
    file_enabled: bool = Field(default=True, env="LOG_FILE_ENABLED")
    file_path: str = Field(default="./logs/app.log", env="LOG_FILE_PATH")
    file_max_size: int = Field(default=10485760, env="LOG_FILE_MAX_SIZE")  # 10MB
    file_backup_count: int = Field(default=5, env="LOG_FILE_BACKUP_COUNT")
    
    # Structured logging
    json_format: bool = Field(default=False, env="LOG_JSON_FORMAT")
    
    @validator('level')
    def validate_log_level(cls, v):
        """Validate log level."""
        valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if v.upper() not in valid_levels:
            raise ValueError(f"Invalid log level: {v}. Must be one of {valid_levels}")
        return v.upper()


class APISettings(BaseSettings):
    """API configuration."""
    
    title: str = Field(default="Financial Analysis ML API", env="API_TITLE")
    description: str = Field(
        default="A comprehensive financial analysis system with ML capabilities",
        env="API_DESCRIPTION"
    )
    version: str = Field(default="1.0.0", env="API_VERSION")
    
    # Server settings
    host: str = Field(default="0.0.0.0", env="API_HOST")
    port: int = Field(default=8000, env="API_PORT")
    workers: int = Field(default=1, env="API_WORKERS")
    
    # Documentation
    docs_url: str = Field(default="/docs", env="API_DOCS_URL")
    redoc_url: str = Field(default="/redoc", env="API_REDOC_URL")
    openapi_url: str = Field(default="/openapi.json", env="API_OPENAPI_URL")
    
    # Request settings
    max_request_size: int = Field(default=16777216, env="API_MAX_REQUEST_SIZE")  # 16MB
    request_timeout: int = Field(default=30, env="API_REQUEST_TIMEOUT")  # seconds


class ExternalAPISettings(BaseSettings):
    """External API configuration."""
    
    # Alpha Vantage API
    alpha_vantage_api_key: Optional[str] = Field(default=None, env="ALPHA_VANTAGE_API_KEY")
    alpha_vantage_base_url: str = Field(
        default="https://www.alphavantage.co/query",
        env="ALPHA_VANTAGE_BASE_URL"
    )
    
    # Yahoo Finance
    yahoo_finance_enabled: bool = Field(default=True, env="YAHOO_FINANCE_ENABLED")
    
    # Request settings
    request_timeout: int = Field(default=30, env="EXTERNAL_API_TIMEOUT")
    max_retries: int = Field(default=3, env="EXTERNAL_API_MAX_RETRIES")
    retry_delay: int = Field(default=1, env="EXTERNAL_API_RETRY_DELAY")


class Settings(BaseSettings):
    """Main application settings."""
    
    # Environment
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")
    testing: bool = Field(default=False, env="TESTING")
    
    # Sub-settings
    database: DatabaseSettings = DatabaseSettings()
    redis: RedisSettings = RedisSettings()
    celery: CelerySettings = CelerySettings()
    security: SecuritySettings = SecuritySettings()
    ml: MLSettings = MLSettings()
    logging: LoggingSettings = LoggingSettings()
    api: APISettings = APISettings()
    external_apis: ExternalAPISettings = ExternalAPISettings()
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        env_nested_delimiter = "__"
    
    @validator('environment')
    def validate_environment(cls, v):
        """Validate environment."""
        valid_envs = ['development', 'staging', 'production', 'testing']
        if v.lower() not in valid_envs:
            raise ValueError(f"Invalid environment: {v}. Must be one of {valid_envs}")
        return v.lower()
    
    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.environment == "production"
    
    @property
    def is_testing(self) -> bool:
        """Check if running in testing mode."""
        return self.environment == "testing" or self.testing


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()


def setup_logging(settings: Settings) -> None:
    """Setup application logging."""
    import logging.config
    import os
    from pathlib import Path
    
    # Create logs directory if it doesn't exist
    log_dir = Path(settings.logging.file_path).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Logging configuration
    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": settings.logging.format,
            },
            "json": {
                "format": "%(message)s",
                "class": "pythonjsonlogger.jsonlogger.JsonFormatter",
            } if settings.logging.json_format else {
                "format": settings.logging.format,
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": settings.logging.level,
                "formatter": "json" if settings.logging.json_format else "default",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {
            "level": settings.logging.level,
            "handlers": ["console"],
        },
        "loggers": {
            "uvicorn": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "celery": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "sqlalchemy.engine": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
        },
    }
    
    # Add file handler if enabled
    if settings.logging.file_enabled:
        config["handlers"]["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "level": settings.logging.level,
            "formatter": "json" if settings.logging.json_format else "default",
            "filename": settings.logging.file_path,
            "maxBytes": settings.logging.file_max_size,
            "backupCount": settings.logging.file_backup_count,
        }
        config["root"]["handlers"].append("file")
        
        # Add file handler to specific loggers
        for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access", "celery"]:
            config["loggers"][logger_name]["handlers"].append("file")
    
    logging.config.dictConfig(config)