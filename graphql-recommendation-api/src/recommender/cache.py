"""Small async cache port: in-process TTL cache by default, Redis when REDIS_URL is set."""

from __future__ import annotations

import time
from typing import Protocol

import structlog

logger = structlog.get_logger(__name__)


class Cache(Protocol):
    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, ttl_seconds: int) -> None: ...

    async def ping(self) -> bool: ...

    async def close(self) -> None: ...


class MemoryCache:
    def __init__(self, max_entries: int = 10_000) -> None:
        self._data: dict[str, tuple[float, str]] = {}
        self._max_entries = max_entries

    async def get(self, key: str) -> str | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            self._data.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        if len(self._data) >= self._max_entries:
            self._data.pop(next(iter(self._data)))  # evict oldest insertion
        self._data[key] = (time.monotonic() + ttl_seconds, value)

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        self._data.clear()


class RedisCache:
    """Redis-backed cache. Errors are logged and treated as cache misses (fail-open)."""

    def __init__(self, url: str) -> None:
        from redis.asyncio import Redis

        self._redis = Redis.from_url(url, decode_responses=True, socket_timeout=1.0)

    async def get(self, key: str) -> str | None:
        try:
            value = await self._redis.get(key)
        except Exception as exc:
            logger.warning("cache.get.failed", error=type(exc).__name__)
            return None
        return None if value is None else str(value)

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        try:
            await self._redis.set(key, value, ex=ttl_seconds)
        except Exception as exc:
            logger.warning("cache.set.failed", error=type(exc).__name__)

    async def ping(self) -> bool:
        try:
            return bool(await self._redis.ping())
        except Exception:
            return False

    async def close(self) -> None:
        await self._redis.aclose()


def build_cache(redis_url: str | None) -> Cache:
    return RedisCache(redis_url) if redis_url else MemoryCache()
