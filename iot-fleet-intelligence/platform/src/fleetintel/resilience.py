"""Resilience primitives for third-party calls: retry with jittered backoff,
circuit breaker and read-through caching. Clocks, sleeps and randomness are
injectable so behaviour is deterministic under test."""

from __future__ import annotations

import random
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import httpx


class CircuitOpenError(RuntimeError):
    """Raised without calling the dependency while the breaker is open."""


class BreakerState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5
    reset_timeout: float = 30.0
    clock: Callable[[], float] = time.monotonic
    state: BreakerState = BreakerState.CLOSED
    failures: int = 0
    opened_at: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def call[T](self, fn: Callable[[], T]) -> T:
        with self._lock:
            if self.state is BreakerState.OPEN:
                if self.clock() - self.opened_at < self.reset_timeout:
                    raise CircuitOpenError(f"circuit '{self.name}' is open")
                self.state = BreakerState.HALF_OPEN  # allow one trial request
        try:
            result = fn()
        except Exception:
            with self._lock:
                self.failures += 1
                if self.state is BreakerState.HALF_OPEN or self.failures >= self.failure_threshold:
                    self.state = BreakerState.OPEN
                    self.opened_at = self.clock()
            raise
        with self._lock:
            self.state = BreakerState.CLOSED
            self.failures = 0
        return result


def is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):  # timeouts, connection resets, DNS
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


@dataclass
class RetryPolicy:
    attempts: int = 3  # total attempts, including the first
    base_delay: float = 0.2
    max_delay: float = 2.0
    sleep: Callable[[float], None] = time.sleep
    rng: random.Random = field(default_factory=lambda: random.Random(0))  # noqa: S311 - jitter, not crypto

    def run[T](self, fn: Callable[[], T]) -> T:
        for attempt in range(1, self.attempts + 1):
            try:
                return fn()
            except Exception as exc:
                if attempt == self.attempts or not is_retryable(exc):
                    raise
                # full jitter backoff (AWS Architecture Blog, "Exponential Backoff And Jitter")
                cap = min(self.max_delay, self.base_delay * 2 ** (attempt - 1))
                self.sleep(self.rng.uniform(0, cap))
        raise AssertionError("unreachable")  # pragma: no cover


@dataclass
class ResilientCaller:
    """cache -> circuit breaker -> retry -> call, returning (value, cached)."""

    breaker: CircuitBreaker
    retry: RetryPolicy
    cache: Any | None = None  # ports.Cache
    ttl_seconds: int = 900

    def call(self, key: str, fn: Callable[[], dict[str, Any]]) -> tuple[dict[str, Any], bool]:
        if self.cache is not None and self.ttl_seconds > 0:
            hit = self.cache.get(key)
            if hit is not None:
                return hit, True
        value = self.breaker.call(lambda: self.retry.run(fn))
        if self.cache is not None and self.ttl_seconds > 0:
            self.cache.put(key, value, self.ttl_seconds)
        return value, False
