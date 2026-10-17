"""Async engine/session lifecycle."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from recommender.models import Base


class Database:
    def __init__(self, url: str, *, echo: bool = False) -> None:
        kwargs: dict[str, object] = {"echo": echo}
        if not url.startswith("sqlite"):
            kwargs |= {"pool_size": 10, "max_overflow": 10, "pool_pre_ping": True}
        self.url = url
        self.engine: AsyncEngine = create_async_engine(url, **kwargs)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def create_all(self) -> None:
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
