"""Application settings and configuration."""
import os
from typing import Optional, List
from pydantic import BaseSettings, Field


class DatabaseSettings(BaseSettings):
    """Database configuration."""
    
    url: str = Field(
        default="postgresql+asyncpg://user:password@localhost/graphql_recommendation",
        env="DATABASE_URL"
    )
    echo: bool = Field(default=False, env="DATABASE_ECHO")
    pool_size: int = Field(default=20, env="DATABASE_POOL_SIZE")
    max_overflow: int = Field(default=30, env="DATABASE_MAX_OVERFLOW")


class RedisSettings(BaseSettings):
    """Redis cluster configuration."""
    
    nodes: List[str] = Field(
        default=["redis://localhost:7000", "redis://localhost:7001", "redis://localhost:7002"],
        env="REDIS_NODES"
    )
    password: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    decode_responses: bool = Field(default=True, env="REDIS_DECODE_RESPONSES")
    skip_full_coverage_check: bool = Field(default=True, env="REDIS_SKIP_COVERAGE_CHECK")


class VectorDatabaseSettings(BaseSettings):
    """Vector database configuration."""
    
    provider: str = Field(default="pinecone", env="VECTOR_DB_PROVIDER")  # pinecone, weaviate, qdrant
    
    # Pinecone
    pinecone_api_key: Optional[str] = Field(default=None, env="PINECONE_API_KEY")
    pinecone_environment: Optional[str] = Field(default=None, env="PINECONE_ENVIRONMENT")
    pinecone_index_name: str = Field(default="recommendations", env="PINECONE_INDEX_NAME")
    
    # Weaviate
    weaviate_url: str = Field(default="http://localhost:8080", env="WEAVIATE_URL")
    weaviate_api_key: Optional[str] = Field(default=None, env="WEAVIATE_API_KEY")
    
    # Qdrant
    qdrant_url: str = Field(default="http://localhost:6333", env="QDRANT_URL")
    qdrant_api_key: Optional[str] = Field(default=None, env="QDRANT_API_KEY")
    qdrant_collection_name: str = Field(default="recommendations", env="QDRANT_COLLECTION_NAME")


class AuthSettings(BaseSettings):
    """Authentication configuration."""
    
    secret_key: str = Field(default="your-secret-key-change-in-production", env="SECRET_KEY")
    algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, env="REFRESH_TOKEN_EXPIRE_DAYS")


class RateLimitSettings(BaseSettings):
    """Rate limiting configuration."""
    
    default_limit: str = Field(default="1000/hour", env="RATE_LIMIT_DEFAULT")
    authenticated_limit: str = Field(default="5000/hour", env="RATE_LIMIT_AUTHENTICATED")
    premium_limit: str = Field(default="10000/hour", env="RATE_LIMIT_PREMIUM")


class MonitoringSettings(BaseSettings):
    """Monitoring and metrics configuration."""
    
    enable_prometheus: bool = Field(default=True, env="ENABLE_PROMETHEUS")
    enable_tracing: bool = Field(default=True, env="ENABLE_TRACING")
    jaeger_endpoint: Optional[str] = Field(default=None, env="JAEGER_ENDPOINT")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")


class RecommendationSettings(BaseSettings):
    """Recommendation engine configuration."""
    
    default_num_recommendations: int = Field(default=10, env="DEFAULT_NUM_RECOMMENDATIONS")
    max_num_recommendations: int = Field(default=100, env="MAX_NUM_RECOMMENDATIONS")
    matrix_factorization_factors: int = Field(default=100, env="MF_FACTORS")
    matrix_factorization_iterations: int = Field(default=50, env="MF_ITERATIONS")
    content_similarity_threshold: float = Field(default=0.7, env="CONTENT_SIMILARITY_THRESHOLD")
    collaborative_min_interactions: int = Field(default=5, env="COLLABORATIVE_MIN_INTERACTIONS")


class Settings(BaseSettings):
    """Main application settings."""
    
    app_name: str = Field(default="GraphQL Recommendation API", env="APP_NAME")
    version: str = Field(default="1.0.0", env="APP_VERSION")
    debug: bool = Field(default=False, env="DEBUG")
    
    # Service discovery
    service_name: str = Field(default="recommendation-api", env="SERVICE_NAME")
    service_port: int = Field(default=8000, env="SERVICE_PORT")
    service_host: str = Field(default="0.0.0.0", env="SERVICE_HOST")
    
    # CORS
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"],
        env="CORS_ORIGINS"
    )
    
    # Component settings
    database: DatabaseSettings = DatabaseSettings()
    redis: RedisSettings = RedisSettings()
    vector_db: VectorDatabaseSettings = VectorDatabaseSettings()
    auth: AuthSettings = AuthSettings()
    rate_limit: RateLimitSettings = RateLimitSettings()
    monitoring: MonitoringSettings = MonitoringSettings()
    recommendation: RecommendationSettings = RecommendationSettings()
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()