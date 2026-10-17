"""Async database engine and session management (SQLAlchemy 2.x)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


class Database:
    """Owns the async engine and session factory for the application lifetime."""

    def __init__(self, url: str, *, echo: bool = False) -> None:
        kwargs: dict[str, object] = {"echo": echo}
        if not url.startswith("sqlite"):
            kwargs |= {"pool_size": 5, "max_overflow": 10, "pool_pre_ping": True}
        self.engine: AsyncEngine = create_async_engine(url, **kwargs)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def create_all(self) -> None:
        """Create tables (used for SQLite/dev; production uses Alembic migrations)."""
        from financial_analysis.infrastructure.database.models import Base

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def ping(self) -> bool:
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            return False
        return True

    async def close(self) -> None:
        await self.engine.dispose()


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a session bound to the app's database."""
    database: Database = request.app.state.database
    async with database.session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
