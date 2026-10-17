from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from recommender.cache import MemoryCache, RedisCache, build_cache
from recommender.security import TokenService, hash_password, verify_password


def test_password_hashing():
    hashed = hash_password("s3cret-pass")

    assert verify_password("s3cret-pass", hashed)
    assert not verify_password("wrong", hashed)
    assert not verify_password("x", "not-a-bcrypt-hash")


def test_tokens_roundtrip_and_rejections():
    tokens = TokenService("test-secret-key-with-at-least-32-bytes!")
    user_id = uuid.uuid4()

    assert tokens.decode(tokens.create(user_id)) == user_id
    assert tokens.decode(tokens.create(user_id, expires_in=timedelta(seconds=-5))) is None
    assert tokens.decode("garbage") is None
    other = TokenService("another-secret-key-with-at-least-32-bytes")
    assert other.decode(tokens.create(user_id)) is None


async def test_memory_cache_ttl_and_eviction(monkeypatch: pytest.MonkeyPatch):
    cache = MemoryCache(max_entries=2)
    await cache.set("a", "1", 60)
    await cache.set("b", "2", 60)
    await cache.set("c", "3", 60)  # evicts "a"

    assert await cache.get("a") is None
    assert await cache.get("c") == "3"
    await cache.set("d", "4", -1)
    assert await cache.get("d") is None
    assert await cache.ping()
    await cache.close()
    assert await cache.get("c") is None


async def test_redis_cache_fails_open_when_unreachable():
    cache = build_cache("redis://127.0.0.1:1/0")
    assert isinstance(cache, RedisCache)

    await cache.set("k", "v", 10)
    assert await cache.get("k") is None
    assert not await cache.ping()
    await cache.close()
