"""Circuit breaker implementation for external service calls."""
import asyncio
import time
from enum import Enum
from typing import Any, Callable, Dict, Optional, Type, Union

from .config import settings
from .logging import get_logger

logger = get_logger(__name__)


class CircuitBreakerState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerError(Exception):
    """Circuit breaker specific exception."""
    pass


class CircuitBreaker:
    """Async circuit breaker implementation."""
    
    def __init__(
        self,
        failure_threshold: int = None,
        recovery_timeout: int = None,
        expected_exception: Union[Type[Exception], tuple] = None,
        name: str = "default"
    ):
        self.failure_threshold = failure_threshold or settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD
        self.recovery_timeout = recovery_timeout or settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT
        self.expected_exception = expected_exception or settings.CIRCUIT_BREAKER_EXPECTED_EXCEPTION
        self.name = name
        
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
        self._success_count = 0
        self._lock = asyncio.Lock()
        
        logger.info(f"Circuit breaker '{name}' initialized", extra={
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout
        })
    
    @property
    def state(self) -> CircuitBreakerState:
        """Get current circuit breaker state."""
        return self._state
    
    @property
    def failure_count(self) -> int:
        """Get current failure count."""
        return self._failure_count
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection."""
        async with self._lock:
            await self._check_state()
            
            if self._state == CircuitBreakerState.OPEN:
                raise CircuitBreakerError(
                    f"Circuit breaker '{self.name}' is OPEN"
                )
        
        try:
            result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
            await self._on_success()
            return result
        except self.expected_exception as e:
            await self._on_failure()
            raise e
    
    async def _check_state(self):
        """Check and update circuit breaker state."""
        now = time.time()
        
        if self._state == CircuitBreakerState.OPEN:
            if (self._last_failure_time and 
                now - self._last_failure_time >= self.recovery_timeout):
                self._state = CircuitBreakerState.HALF_OPEN
                self._success_count = 0
                logger.info(f"Circuit breaker '{self.name}' moved to HALF_OPEN")
    
    async def _on_success(self):
        """Handle successful call."""
        async with self._lock:
            self._failure_count = 0
            
            if self._state == CircuitBreakerState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= 3:  # Require 3 successes to close
                    self._state = CircuitBreakerState.CLOSED
                    logger.info(f"Circuit breaker '{self.name}' moved to CLOSED")
    
    async def _on_failure(self):
        """Handle failed call."""
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            
            if self._failure_count >= self.failure_threshold:
                self._state = CircuitBreakerState.OPEN
                logger.warning(f"Circuit breaker '{self.name}' moved to OPEN", extra={
                    "failure_count": self._failure_count,
                    "threshold": self.failure_threshold
                })
            elif self._state == CircuitBreakerState.HALF_OPEN:
                self._state = CircuitBreakerState.OPEN
                logger.warning(f"Circuit breaker '{self.name}' moved back to OPEN from HALF_OPEN")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get circuit breaker metrics."""
        return {
            "name": self.name,
            "state": self._state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_time": self._last_failure_time
        }


class CircuitBreakerManager:
    """Manager for multiple circuit breakers."""
    
    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
    
    def get_breaker(
        self, 
        name: str, 
        failure_threshold: int = None,
        recovery_timeout: int = None,
        expected_exception: Union[Type[Exception], tuple] = None
    ) -> CircuitBreaker:
        """Get or create a circuit breaker."""
        if name not in self._breakers:
            self._breakers[name] = CircuitBreaker(
                failure_threshold=failure_threshold,
                recovery_timeout=recovery_timeout,
                expected_exception=expected_exception,
                name=name
            )
        return self._breakers[name]
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get metrics for all circuit breakers."""
        return {name: breaker.get_metrics() for name, breaker in self._breakers.items()}


# Global circuit breaker manager
circuit_breaker_manager = CircuitBreakerManager()


def circuit_breaker(
    name: str = None,
    failure_threshold: int = None,
    recovery_timeout: int = None,
    expected_exception: Union[Type[Exception], tuple] = None
):
    """Decorator for circuit breaker protection."""
    def decorator(func: Callable):
        breaker_name = name or f"{func.__module__}.{func.__name__}"
        breaker = circuit_breaker_manager.get_breaker(
            breaker_name, failure_threshold, recovery_timeout, expected_exception
        )
        
        async def async_wrapper(*args, **kwargs):
            return await breaker.call(func, *args, **kwargs)
        
        def sync_wrapper(*args, **kwargs):
            return asyncio.run(breaker.call(func, *args, **kwargs))
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator