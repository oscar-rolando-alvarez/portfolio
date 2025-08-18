"""Cache manager with different caching strategies."""
import uuid
import hashlib
from typing import Any, Optional, Dict, List, Callable
from functools import wraps
import asyncio
from app.cache.redis_cluster import redis_client


class CacheManager:
    """Cache manager with various caching strategies."""
    
    def __init__(self):
        self.default_ttl = 3600  # 1 hour
        self.recommendation_ttl = 1800  # 30 minutes
        self.user_data_ttl = 7200  # 2 hours
        self.item_data_ttl = 14400  # 4 hours
    
    def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from arguments."""
        key_parts = [str(prefix)]
        key_parts.extend([str(arg) for arg in args])
        key_parts.extend([f"{k}:{v}" for k, v in sorted(kwargs.items())])
        key_string = "|".join(key_parts)
        
        # Hash long keys
        if len(key_string) > 200:
            key_hash = hashlib.md5(key_string.encode()).hexdigest()
            return f"{prefix}:hash:{key_hash}"
        
        return key_string.replace(" ", "_")
    
    async def get_recommendations(
        self,
        user_id: uuid.UUID,
        algorithm: str,
        num_items: int = 10,
        **params
    ) -> Optional[List[Dict[str, Any]]]:
        """Get cached recommendations."""
        cache_key = self._generate_cache_key(
            "rec",
            user_id,
            algorithm,
            num_items,
            **params
        )
        return await redis_client.get(cache_key)
    
    async def set_recommendations(
        self,
        user_id: uuid.UUID,
        algorithm: str,
        recommendations: List[Dict[str, Any]],
        num_items: int = 10,
        **params
    ) -> bool:
        """Cache recommendations."""
        cache_key = self._generate_cache_key(
            "rec",
            user_id,
            algorithm,
            num_items,
            **params
        )
        return await redis_client.set(
            cache_key,
            recommendations,
            expire=self.recommendation_ttl
        )
    
    async def get_user_data(self, user_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """Get cached user data."""
        cache_key = f"user:{user_id}"
        return await redis_client.get(cache_key)
    
    async def set_user_data(
        self,
        user_id: uuid.UUID,
        user_data: Dict[str, Any]
    ) -> bool:
        """Cache user data."""
        cache_key = f"user:{user_id}"
        return await redis_client.set(
            cache_key,
            user_data,
            expire=self.user_data_ttl
        )
    
    async def get_item_data(self, item_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        """Get cached item data."""
        cache_key = f"item:{item_id}"
        return await redis_client.get(cache_key)
    
    async def set_item_data(
        self,
        item_id: uuid.UUID,
        item_data: Dict[str, Any]
    ) -> bool:
        """Cache item data."""
        cache_key = f"item:{item_id}"
        return await redis_client.set(
            cache_key,
            item_data,
            expire=self.item_data_ttl
        )
    
    async def get_user_interactions(
        self,
        user_id: uuid.UUID,
        interaction_type: Optional[str] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """Get cached user interactions."""
        cache_key = f"interactions:{user_id}"
        if interaction_type:
            cache_key += f":{interaction_type}"
        return await redis_client.get(cache_key)
    
    async def set_user_interactions(
        self,
        user_id: uuid.UUID,
        interactions: List[Dict[str, Any]],
        interaction_type: Optional[str] = None
    ) -> bool:
        """Cache user interactions."""
        cache_key = f"interactions:{user_id}"
        if interaction_type:
            cache_key += f":{interaction_type}"
        return await redis_client.set(
            cache_key,
            interactions,
            expire=self.default_ttl
        )
    
    async def get_similarity_matrix(
        self,
        matrix_type: str,  # user or item
        algorithm: str
    ) -> Optional[Dict[str, Any]]:
        """Get cached similarity matrix."""
        cache_key = f"similarity:{matrix_type}:{algorithm}"
        return await redis_client.get(cache_key)
    
    async def set_similarity_matrix(
        self,
        matrix_type: str,
        algorithm: str,
        matrix_data: Dict[str, Any]
    ) -> bool:
        """Cache similarity matrix."""
        cache_key = f"similarity:{matrix_type}:{algorithm}"
        # Longer TTL for similarity matrices as they're expensive to compute
        return await redis_client.set(
            cache_key,
            matrix_data,
            expire=86400  # 24 hours
        )
    
    async def invalidate_user_cache(self, user_id: uuid.UUID):
        """Invalidate all cache for a user."""
        patterns = [
            f"user:{user_id}",
            f"interactions:{user_id}*",
            f"rec:{user_id}*"
        ]
        
        # Redis cluster doesn't support pattern deletion directly
        # We'll need to track keys or use a different approach
        tasks = []
        for pattern in patterns:
            if "*" not in pattern:
                tasks.append(redis_client.delete(pattern))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def invalidate_item_cache(self, item_id: uuid.UUID):
        """Invalidate cache for an item."""
        cache_key = f"item:{item_id}"
        await redis_client.delete(cache_key)
    
    async def get_popular_items(
        self,
        tenant_id: uuid.UUID,
        category: Optional[str] = None,
        limit: int = 100
    ) -> Optional[List[Dict[str, Any]]]:
        """Get cached popular items."""
        cache_key = f"popular:{tenant_id}"
        if category:
            cache_key += f":{category}"
        cache_key += f":{limit}"
        return await redis_client.get(cache_key)
    
    async def set_popular_items(
        self,
        tenant_id: uuid.UUID,
        items: List[Dict[str, Any]],
        category: Optional[str] = None,
        limit: int = 100
    ) -> bool:
        """Cache popular items."""
        cache_key = f"popular:{tenant_id}"
        if category:
            cache_key += f":{category}"
        cache_key += f":{limit}"
        return await redis_client.set(
            cache_key,
            items,
            expire=7200  # 2 hours
        )


def cache_result(
    key_prefix: str,
    ttl: int = 3600,
    key_func: Optional[Callable] = None
):
    """Decorator to cache function results."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                cache_key = cache_manager._generate_cache_key(
                    key_prefix, *args, **kwargs
                )
            
            # Try to get from cache
            cached_result = await redis_client.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            if result is not None:
                await redis_client.set(cache_key, result, expire=ttl)
            
            return result
        return wrapper
    return decorator


# Global cache manager
cache_manager = CacheManager()