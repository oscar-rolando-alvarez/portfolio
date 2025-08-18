"""Rate limiting middleware for GraphQL API."""
import time
import uuid
from typing import Optional, Dict, Any
from fastapi import HTTPException, status, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import asyncio
from app.config import settings
from app.cache import redis_client


class AdvancedRateLimiter:
    """Advanced rate limiter with tenant and user-specific limits."""
    
    def __init__(self):
        self.redis = redis_client
        self.default_limit = settings.rate_limit.default_limit
        self.authenticated_limit = settings.rate_limit.authenticated_limit
        self.premium_limit = settings.rate_limit.premium_limit
    
    async def _get_rate_limit_key(
        self,
        identifier: str,
        limit_type: str = "default"
    ) -> str:
        """Generate rate limit key."""
        return f"rate_limit:{limit_type}:{identifier}"
    
    async def _parse_limit(self, limit_str: str) -> tuple[int, int]:
        """Parse limit string like '1000/hour' to (count, seconds)."""
        parts = limit_str.split('/')
        if len(parts) != 2:
            raise ValueError(f"Invalid limit format: {limit_str}")
        
        count = int(parts[0])
        period = parts[1].lower()
        
        period_seconds = {
            'second': 1,
            'minute': 60,
            'hour': 3600,
            'day': 86400
        }
        
        if period not in period_seconds:
            raise ValueError(f"Invalid period: {period}")
        
        return count, period_seconds[period]
    
    async def _is_rate_limited(
        self,
        key: str,
        limit: int,
        window_seconds: int
    ) -> tuple[bool, Dict[str, Any]]:
        """Check if rate limit is exceeded using sliding window."""
        current_time = int(time.time())
        window_start = current_time - window_seconds
        
        # Use Redis sorted set for sliding window
        pipe = await self.redis._cluster.pipeline() if hasattr(self.redis, '_cluster') else None
        
        if pipe:
            # Remove old entries
            pipe.zremrangebyscore(key, 0, window_start)
            # Count current requests
            pipe.zcard(key)
            # Add current request
            pipe.zadd(key, {str(current_time): current_time})
            # Set expiration
            pipe.expire(key, window_seconds)
            
            results = await pipe.execute()
            current_count = results[1] + 1  # +1 for the current request
        else:
            # Fallback to simple counter
            current_count = await self.redis.incr(key)
            if current_count == 1:
                await self.redis.expire(key, window_seconds)
        
        is_limited = current_count > limit
        
        return is_limited, {
            "current_count": current_count,
            "limit": limit,
            "window_seconds": window_seconds,
            "reset_time": current_time + window_seconds
        }
    
    async def check_rate_limit(
        self,
        request: Request,
        user_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        subscription_tier: str = "basic"
    ) -> Optional[Dict[str, Any]]:
        """Check rate limit for request."""
        # Determine identifier and limit
        if user_id:
            identifier = f"user:{user_id}"
            if subscription_tier == "enterprise":
                limit_str = "20000/hour"  # Higher limit for enterprise
            elif subscription_tier == "premium":
                limit_str = self.premium_limit
            else:
                limit_str = self.authenticated_limit
        else:
            # Use IP address for unauthenticated requests
            identifier = f"ip:{get_remote_address(request)}"
            limit_str = self.default_limit
        
        # Add tenant-specific rate limiting
        if tenant_id:
            tenant_identifier = f"tenant:{tenant_id}"
            tenant_limit_str = "50000/hour"  # Tenant-wide limit
            
            try:
                tenant_limit, tenant_window = await self._parse_limit(tenant_limit_str)
                tenant_key = await self._get_rate_limit_key(tenant_identifier, "tenant")
                
                tenant_limited, tenant_info = await self._is_rate_limited(
                    tenant_key, tenant_limit, tenant_window
                )
                
                if tenant_limited:
                    return {
                        "error": "Tenant rate limit exceeded",
                        "limit_type": "tenant",
                        **tenant_info
                    }
            except Exception:
                pass  # Continue with user/IP rate limiting
        
        # Check user/IP rate limit
        try:
            limit, window_seconds = await self._parse_limit(limit_str)
            key = await self._get_rate_limit_key(identifier)
            
            is_limited, limit_info = await self._is_rate_limited(key, limit, window_seconds)
            
            if is_limited:
                return {
                    "error": "Rate limit exceeded",
                    "limit_type": "user" if user_id else "ip",
                    **limit_info
                }
            
            return limit_info
            
        except Exception as e:
            # Don't block requests if rate limiting fails
            return None
    
    async def get_rate_limit_status(
        self,
        user_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get current rate limit status."""
        status_info = {}
        
        # Check user rate limit status
        if user_id:
            identifier = f"user:{user_id}"
            key = await self._get_rate_limit_key(identifier)
            
            try:
                current_count = await self.redis.get(key) or 0
                status_info["user"] = {
                    "current_count": int(current_count),
                    "limit": self.authenticated_limit
                }
            except Exception:
                pass
        
        # Check tenant rate limit status
        if tenant_id:
            identifier = f"tenant:{tenant_id}"
            key = await self._get_rate_limit_key(identifier, "tenant")
            
            try:
                current_count = await self.redis.get(key) or 0
                status_info["tenant"] = {
                    "current_count": int(current_count),
                    "limit": "50000/hour"
                }
            except Exception:
                pass
        
        # Check IP rate limit status
        if ip_address:
            identifier = f"ip:{ip_address}"
            key = await self._get_rate_limit_key(identifier)
            
            try:
                current_count = await self.redis.get(key) or 0
                status_info["ip"] = {
                    "current_count": int(current_count),
                    "limit": self.default_limit
                }
            except Exception:
                pass
        
        return status_info


class GraphQLRateLimiter:
    """GraphQL-specific rate limiter."""
    
    def __init__(self):
        self.rate_limiter = AdvancedRateLimiter()
        self.operation_limits = {
            # Different limits for different operations
            "query": "2000/hour",
            "mutation": "1000/hour",
            "subscription": "500/hour"
        }
        self.expensive_operations = {
            # Operations that count as multiple requests
            "recommend": 5,
            "similarItems": 3,
            "trainModel": 10
        }
    
    async def check_graphql_rate_limit(
        self,
        request: Request,
        operation_type: str,
        operation_name: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        subscription_tier: str = "basic"
    ) -> Optional[Dict[str, Any]]:
        """Check rate limit for GraphQL operations."""
        # Calculate request cost
        cost = 1
        if operation_name in self.expensive_operations:
            cost = self.expensive_operations[operation_name]
        
        # Apply cost multiplier for subscription tier
        if subscription_tier == "basic":
            cost *= 2  # Basic users have higher cost
        elif subscription_tier == "premium":
            cost *= 1.5
        # Enterprise users use base cost
        
        # Check general rate limit first
        general_limit_info = await self.rate_limiter.check_rate_limit(
            request, user_id, tenant_id, subscription_tier
        )
        
        if general_limit_info and "error" in general_limit_info:
            return general_limit_info
        
        # Check operation-specific rate limit
        if operation_type in self.operation_limits:
            limit_str = self.operation_limits[operation_type]
            
            # Adjust limit based on subscription tier
            limit, window = await self.rate_limiter._parse_limit(limit_str)
            if subscription_tier == "premium":
                limit = int(limit * 1.5)
            elif subscription_tier == "enterprise":
                limit = int(limit * 3)
            
            identifier = f"op:{operation_type}:"
            if user_id:
                identifier += f"user:{user_id}"
            else:
                identifier += f"ip:{get_remote_address(request)}"
            
            key = await self.rate_limiter._get_rate_limit_key(identifier, "operation")
            
            # Apply cost
            for _ in range(cost):
                is_limited, limit_info = await self.rate_limiter._is_rate_limited(
                    key, limit, window
                )
                
                if is_limited:
                    return {
                        "error": f"Rate limit exceeded for {operation_type} operations",
                        "limit_type": "operation",
                        "operation": operation_type,
                        "cost": cost,
                        **limit_info
                    }
        
        return None


# Global rate limiter instances
rate_limiter = AdvancedRateLimiter()
graphql_rate_limiter = GraphQLRateLimiter()


# Middleware function for FastAPI
async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware for FastAPI."""
    # Skip rate limiting for health checks
    if request.url.path in ["/health", "/metrics"]:
        response = await call_next(request)
        return response
    
    # Extract user info from headers if available
    user_id = None
    tenant_id = None
    subscription_tier = "basic"
    
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        # This would be implemented based on your JWT handler
        # For now, we'll skip user extraction in middleware
        pass
    
    # Check rate limit
    limit_info = await rate_limiter.check_rate_limit(
        request, user_id, tenant_id, subscription_tier
    )
    
    if limit_info and "error" in limit_info:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=limit_info["error"],
            headers={
                "X-RateLimit-Limit": str(limit_info["limit"]),
                "X-RateLimit-Remaining": str(max(0, limit_info["limit"] - limit_info["current_count"])),
                "X-RateLimit-Reset": str(limit_info["reset_time"])
            }
        )
    
    response = await call_next(request)
    
    # Add rate limit headers to response
    if limit_info:
        response.headers["X-RateLimit-Limit"] = str(limit_info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit_info["limit"] - limit_info["current_count"]))
        response.headers["X-RateLimit-Reset"] = str(limit_info["reset_time"])
    
    return response