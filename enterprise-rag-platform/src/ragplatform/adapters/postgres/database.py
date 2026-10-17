"""Async engine + tenant-scoped transactions.

Every transaction touching tenant data runs ``set_config('app.tenant_id', ..., true)`` so
that PostgreSQL row-level security policies (see migration 0001) enforce isolation as a
second line of defence behind the explicit ``tenant_id`` predicates in every query.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine


class Database:
    def __init__(self, url: str, *, pool_size: int = 10) -> None:
        self.engine: AsyncEngine = create_async_engine(
            url, pool_size=pool_size, max_overflow=pool_size, pool_pre_ping=True
        )

    @asynccontextmanager
    async def tenant_tx(self, tenant_id: str) -> AsyncIterator[AsyncConnection]:
        async with self.engine.begin() as conn:
            await conn.execute(
                text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id}
            )
            yield conn

    @asynccontextmanager
    async def system_tx(self) -> AsyncIterator[AsyncConnection]:
        """For tenant-agnostic tables only (jobs queue, API keys, tenants)."""
        async with self.engine.begin() as conn:
            yield conn

    async def ping(self) -> bool:
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            return False
        return True

    async def dispose(self) -> None:
        await self.engine.dispose()


def as_json(value: Any) -> Any:
    """asyncpg returns json/jsonb from textual SQL as ``str``."""
    return json.loads(value) if isinstance(value, str) else value


def vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.7g}" for v in vec) + "]"


def parse_vector(value: Any) -> list[float]:
    if isinstance(value, str):
        return [float(x) for x in value.strip("[]").split(",") if x]
    return [float(x) for x in value]
