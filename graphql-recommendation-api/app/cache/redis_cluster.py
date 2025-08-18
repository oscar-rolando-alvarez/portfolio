"""Redis cluster client."""
import json
import logging
from typing import Any, Optional, Dict, List, Union
import asyncio
from redis.asyncio import Redis
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError
from app.config import settings

logger = logging.getLogger(__name__)


class RedisClusterClient:
    """Redis cluster client with caching functionality."""
    
    def __init__(self):
        self._cluster: Optional[RedisCluster] = None
        self._connected = False
    
    async def connect(self):
        """Connect to Redis cluster."""
        try:
            # Parse Redis nodes
            startup_nodes = []
            for node_url in settings.redis.nodes:
                if node_url.startswith("redis://"):
                    host_port = node_url.replace("redis://", "")
                    if ":" in host_port:
                        host, port = host_port.split(":")
                        startup_nodes.append({"host": host, "port": int(port)})
                    else:
                        startup_nodes.append({"host": host_port, "port": 6379})
            
            self._cluster = RedisCluster(
                startup_nodes=startup_nodes,
                decode_responses=settings.redis.decode_responses,
                skip_full_coverage_check=settings.redis.skip_full_coverage_check,
                password=settings.redis.password,
                retry_on_timeout=True,
                retry_on_error=[RedisError],
                health_check_interval=30
            )
            
            # Test connection
            await self._cluster.ping()
            self._connected = True
            logger.info("Connected to Redis cluster")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis cluster: {e}")
            self._connected = False
            raise
    
    async def disconnect(self):
        """Disconnect from Redis cluster."""
        if self._cluster:
            await self._cluster.close()
            self._connected = False
            logger.info("Disconnected from Redis cluster")
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if not self._connected:
            return None
        
        try:
            value = await self._cluster.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis GET error for key {key}: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: Any,
        expire: Optional[int] = None
    ) -> bool:
        """Set value in cache."""
        if not self._connected:
            return False
        
        try:
            serialized_value = json.dumps(value, default=str)
            result = await self._cluster.set(key, serialized_value, ex=expire)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis SET error for key {key}: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from cache."""
        if not self._connected:
            return False
        
        try:
            result = await self._cluster.delete(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis DELETE error for key {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        if not self._connected:
            return False
        
        try:
            result = await self._cluster.exists(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis EXISTS error for key {key}: {e}")
            return False
    
    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration for key."""
        if not self._connected:
            return False
        
        try:
            result = await self._cluster.expire(key, seconds)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis EXPIRE error for key {key}: {e}")
            return False
    
    async def incr(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment counter."""
        if not self._connected:
            return None
        
        try:
            result = await self._cluster.incr(key, amount)
            return result
        except Exception as e:
            logger.error(f"Redis INCR error for key {key}: {e}")
            return None
    
    async def hget(self, name: str, key: str) -> Optional[Any]:
        """Get hash field."""
        if not self._connected:
            return None
        
        try:
            value = await self._cluster.hget(name, key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis HGET error for hash {name}, key {key}: {e}")
            return None
    
    async def hset(self, name: str, key: str, value: Any) -> bool:
        """Set hash field."""
        if not self._connected:
            return False
        
        try:
            serialized_value = json.dumps(value, default=str)
            result = await self._cluster.hset(name, key, serialized_value)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis HSET error for hash {name}, key {key}: {e}")
            return False
    
    async def hgetall(self, name: str) -> Dict[str, Any]:
        """Get all hash fields."""
        if not self._connected:
            return {}
        
        try:
            result = await self._cluster.hgetall(name)
            return {k: json.loads(v) for k, v in result.items()}
        except Exception as e:
            logger.error(f"Redis HGETALL error for hash {name}: {e}")
            return {}
    
    async def sadd(self, name: str, *values) -> int:
        """Add members to set."""
        if not self._connected:
            return 0
        
        try:
            result = await self._cluster.sadd(name, *values)
            return result
        except Exception as e:
            logger.error(f"Redis SADD error for set {name}: {e}")
            return 0
    
    async def smembers(self, name: str) -> set:
        """Get set members."""
        if not self._connected:
            return set()
        
        try:
            result = await self._cluster.smembers(name)
            return result
        except Exception as e:
            logger.error(f"Redis SMEMBERS error for set {name}: {e}")
            return set()
    
    async def sismember(self, name: str, value: Any) -> bool:
        """Check if value is in set."""
        if not self._connected:
            return False
        
        try:
            result = await self._cluster.sismember(name, value)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis SISMEMBER error for set {name}: {e}")
            return False
    
    async def zadd(self, name: str, mapping: Dict[str, float]) -> int:
        """Add members to sorted set."""
        if not self._connected:
            return 0
        
        try:
            result = await self._cluster.zadd(name, mapping)
            return result
        except Exception as e:
            logger.error(f"Redis ZADD error for sorted set {name}: {e}")
            return 0
    
    async def zrange(
        self,
        name: str,
        start: int,
        end: int,
        withscores: bool = False
    ) -> List[Union[str, tuple]]:
        """Get sorted set range."""
        if not self._connected:
            return []
        
        try:
            result = await self._cluster.zrange(name, start, end, withscores=withscores)
            return result
        except Exception as e:
            logger.error(f"Redis ZRANGE error for sorted set {name}: {e}")
            return []


# Global Redis client
redis_client = RedisClusterClient()