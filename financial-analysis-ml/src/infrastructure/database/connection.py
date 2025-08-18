"""Database connection configuration."""
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, AsyncEngine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
import logging

logger = logging.getLogger(__name__)


class DatabaseConfig:
    """Database configuration class."""
    
    def __init__(
        self,
        database_url: str = None,
        echo: bool = False,
        pool_size: int = 5,
        max_overflow: int = 10,
        pool_pre_ping: bool = True,
        pool_recycle: int = 3600,
    ):
        self.database_url = database_url or self._get_database_url()
        self.echo = echo
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.pool_pre_ping = pool_pre_ping
        self.pool_recycle = pool_recycle
        
        # Create async engine
        self.engine = self._create_engine()
        
        # Create session factory
        self.async_session_factory = sessionmaker(
            bind=self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    
    def _get_database_url(self) -> str:
        """Get database URL from environment variables."""
        host = os.getenv("POSTGRES_HOST", "localhost")
        port = os.getenv("POSTGRES_PORT", "5432")
        user = os.getenv("POSTGRES_USER", "postgres")
        password = os.getenv("POSTGRES_PASSWORD", "postgres")
        database = os.getenv("POSTGRES_DB", "financial_analysis")
        
        return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{database}"
    
    def _create_engine(self) -> AsyncEngine:
        """Create async database engine."""
        # Use NullPool for testing to avoid connection issues
        if "test" in self.database_url:
            engine = create_async_engine(
                self.database_url,
                echo=self.echo,
                poolclass=NullPool,
            )
        else:
            engine = create_async_engine(
                self.database_url,
                echo=self.echo,
                pool_size=self.pool_size,
                max_overflow=self.max_overflow,
                pool_pre_ping=self.pool_pre_ping,
                pool_recycle=self.pool_recycle,
            )
        
        logger.info(f"Database engine created for: {self.database_url}")
        return engine
    
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get async database session."""
        async with self.async_session_factory() as session:
            try:
                yield session
            except Exception as e:
                logger.error(f"Database session error: {e}")
                await session.rollback()
                raise
            finally:
                await session.close()
    
    async def close(self):
        """Close database engine."""
        if self.engine:
            await self.engine.dispose()
            logger.info("Database engine closed")


# Global database instance
database_config: DatabaseConfig = None


def get_database_config() -> DatabaseConfig:
    """Get global database configuration."""
    global database_config
    if database_config is None:
        database_config = DatabaseConfig()
    return database_config


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session dependency for FastAPI."""
    db_config = get_database_config()
    async for session in db_config.get_session():
        yield session