"""Rate limiting middleware with Redis backend."""
import time
from typing import Optional

import aioredis
from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .logging import get_logger

logger = get_logger(__name__)


class RateLimiter:
    """Redis-based rate limiter using sliding window."""
    
    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or settings.REDIS_URL
        self.redis = None
    
    async def init_redis(self):
        """Initialize Redis connection."""
        if not self.redis:
            self.redis = aioredis.from_url(
                self.redis_url,
                password=settings.REDIS_PASSWORD,
                encoding="utf-8",
                decode_responses=True
            )
    
    async def is_allowed(
        self, 
        identifier: str, 
        limit: int, 
        window: int = 60,
        burst_limit: int = None
    ) -> tuple[bool, dict]:
        """Check if request is allowed under rate limit."""
        await self.init_redis()
        
        now = time.time()
        window_start = now - window
        
        # Keys for rate limiting
        requests_key = f"rate_limit:requests:{identifier}"
        burst_key = f"rate_limit:burst:{identifier}"
        
        pipe = self.redis.pipeline()
        
        # Remove old entries
        pipe.zremrangebyscore(requests_key, 0, window_start)
        
        # Count current requests
        pipe.zcard(requests_key)
        
        # Add current request
        pipe.zadd(requests_key, {str(now): now})
        
        # Set expiration
        pipe.expire(requests_key, window + 10)
        
        # Execute pipeline
        results = await pipe.execute()
        current_requests = results[1]
        
        # Check burst limit if specified
        if burst_limit:
            burst_count = await self.redis.incr(burst_key)
            await self.redis.expire(burst_key, 60)
            
            if burst_count > burst_limit:
                logger.warning(f"Burst limit exceeded for {identifier}", extra={
                    "current_burst": burst_count,
                    "burst_limit": burst_limit
                })
                return False, {
                    "allowed": False,
                    "current_requests": current_requests,
                    "limit": limit,
                    "window": window,
                    "burst_exceeded": True,
                    "reset_time": now + window
                }
        
        # Check rate limit
        if current_requests >= limit:
            logger.warning(f"Rate limit exceeded for {identifier}", extra={
                "current_requests": current_requests,
                "limit": limit,
                "window": window
            })
            return False, {
                "allowed": False,
                "current_requests": current_requests,
                "limit": limit,
                "window": window,
                "reset_time": now + window
            }
        
        return True, {
            "allowed": True,
            "current_requests": current_requests + 1,
            "limit": limit,
            "window": window,
            "reset_time": now + window
        }
    
    async def get_stats(self, identifier: str) -> dict:
        """Get rate limit statistics for identifier."""
        await self.init_redis()
        
        now = time.time()
        window_start = now - 60
        
        requests_key = f"rate_limit:requests:{identifier}"
        burst_key = f"rate_limit:burst:{identifier}"
        
        # Get current counts
        await self.redis.zremrangebyscore(requests_key, 0, window_start)
        current_requests = await self.redis.zcard(requests_key)
        burst_count = await self.redis.get(burst_key) or 0
        
        return {
            "identifier": identifier,
            "current_requests": current_requests,
            "burst_count": int(burst_count),
            "window_start": window_start,
            "now": now
        }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware for FastAPI."""
    
    def __init__(self, app, rate_limiter: RateLimiter = None):
        super().__init__(app)
        self.rate_limiter = rate_limiter or RateLimiter()
    
    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""
        # Skip rate limiting for health checks and metrics
        if request.url.path in ["/health", "/ready", settings.PROMETHEUS_METRICS_PATH]:
            return await call_next(request)
        
        # Get identifier (API key or IP address)
        identifier = await self._get_identifier(request)
        if not identifier:
            return await call_next(request)
        
        # Get rate limit configuration
        limit, burst_limit = await self._get_rate_limit_config(request, identifier)
        
        # Check rate limit
        allowed, stats = await self.rate_limiter.is_allowed(
            identifier, limit, 60, burst_limit
        )
        
        if not allowed:
            # Add rate limit headers
            headers = {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(max(0, limit - stats["current_requests"])),
                "X-RateLimit-Reset": str(int(stats["reset_time"])),
            }
            
            if stats.get("burst_exceeded"):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Burst rate limit exceeded",
                    headers=headers
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded",
                    headers=headers
                )
        
        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - stats["current_requests"]))
        response.headers["X-RateLimit-Reset"] = str(int(stats["reset_time"]))
        
        return response
    
    async def _get_identifier(self, request: Request) -> Optional[str]:
        """Get rate limit identifier from request."""
        # Try API key first
        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        if api_key:
            return f"api_key:{api_key}"
        
        # Fall back to IP address
        client_ip = request.client.host if request.client else None
        if client_ip:
            return f"ip:{client_ip}"
        
        return None
    
    async def _get_rate_limit_config(self, request: Request, identifier: str) -> tuple[int, int]:
        """Get rate limit configuration for identifier."""
        # Default limits
        limit = settings.RATE_LIMIT_PER_MINUTE
        burst_limit = settings.RATE_LIMIT_BURST
        
        # Check if it's an API key and get custom limits from database
        if identifier.startswith("api_key:"):
            # TODO: Implement database lookup for API key specific limits
            pass
        
        return limit, burst_limit


# Global rate limiter instance
rate_limiter = RateLimiter()