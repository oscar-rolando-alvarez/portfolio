"""Database connection and session management."""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from app.config import settings
from app.models import Base

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Database connection manager."""
    
    def __init__(self):
        self._engine: AsyncEngine = None
        self._session_factory: async_sessionmaker = None
    
    def create_engine(self) -> AsyncEngine:
        """Create database engine."""
        if self._engine is None:
            self._engine = create_async_engine(
                settings.database.url,
                echo=settings.database.echo,
                pool_size=settings.database.pool_size,
                max_overflow=settings.database.max_overflow,
                poolclass=StaticPool if "sqlite" in settings.database.url else None,
                connect_args={"check_same_thread": False} if "sqlite" in settings.database.url else {}
            )
            logger.info("Database engine created")
        return self._engine
    
    def create_session_factory(self) -> async_sessionmaker:
        """Create session factory."""
        if self._session_factory is None:
            engine = self.create_engine()
            self._session_factory = async_sessionmaker(
                engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
            logger.info("Session factory created")
        return self._session_factory
    
    async def create_tables(self):
        """Create database tables."""
        engine = self.create_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created")
    
    async def drop_tables(self):
        """Drop database tables."""
        engine = self.create_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.info("Database tables dropped")
    
    async def close(self):
        """Close database connection."""
        if self._engine:
            await self._engine.dispose()
            logger.info("Database connection closed")


# Global database manager
db_manager = DatabaseManager()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session."""
    session_factory = db_manager.create_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for database session."""
    async for session in get_async_session():
        yield session


async def init_database():
    """Initialize database."""
    await db_manager.create_tables()


async def close_database():
    """Close database connections."""
    await db_manager.close()