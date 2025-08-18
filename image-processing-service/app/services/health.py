"""Health check and readiness probe services."""
import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional

import aioredis
import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.services.storage import storage_service
from app.services.message_queue import message_queue

logger = get_logger(__name__)


class HealthCheckError(Exception):
    """Health check specific error."""
    pass


class HealthCheckService:
    """Comprehensive health check service."""
    
    def __init__(self):
        self.start_time = time.time()
        self.last_health_check = None
        self.health_status = "unknown"
        self.dependency_status = {}
    
    async def check_database_health(self) -> Dict[str, any]:
        """Check database connectivity and health."""
        try:
            start_time = time.time()
            
            # Test database connection
            async for db in get_db():
                # Execute a simple query
                result = await db.execute("SELECT 1 as test")
                row = result.fetchone()
                
                if row and row[0] == 1:
                    response_time = time.time() - start_time
                    return {
                        "status": "healthy",
                        "response_time_ms": round(response_time * 1000, 2),
                        "details": "Database connection successful"
                    }
                else:
                    return {
                        "status": "unhealthy",
                        "details": "Database query returned unexpected result"
                    }
                
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return {
                "status": "unhealthy",
                "details": f"Database connection failed: {str(e)}"
            }
    
    async def check_redis_health(self) -> Dict[str, any]:
        """Check Redis connectivity and health."""
        try:
            start_time = time.time()
            
            # Connect to Redis
            redis = aioredis.from_url(
                settings.REDIS_URL,
                password=settings.REDIS_PASSWORD,
                encoding="utf-8",
                decode_responses=True
            )
            
            # Test Redis connection
            await redis.ping()
            
            # Test set/get operation
            test_key = "health_check_test"
            test_value = "ok"
            await redis.set(test_key, test_value, ex=60)
            result = await redis.get(test_key)
            
            await redis.close()
            
            if result == test_value:
                response_time = time.time() - start_time
                return {
                    "status": "healthy",
                    "response_time_ms": round(response_time * 1000, 2),
                    "details": "Redis connection and operations successful"
                }
            else:
                return {
                    "status": "unhealthy",
                    "details": "Redis set/get operation failed"
                }
                
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return {
                "status": "unhealthy",
                "details": f"Redis connection failed: {str(e)}"
            }
    
    async def check_storage_health(self) -> Dict[str, any]:
        """Check S3/MinIO storage health."""
        try:
            start_time = time.time()
            
            # Test storage connection by listing bucket
            async with await storage_service._get_client() as s3:
                await s3.head_bucket(Bucket=settings.S3_BUCKET_NAME)
            
            response_time = time.time() - start_time
            return {
                "status": "healthy",
                "response_time_ms": round(response_time * 1000, 2),
                "details": "Storage service accessible"
            }
            
        except Exception as e:
            logger.error(f"Storage health check failed: {e}")
            return {
                "status": "unhealthy",
                "details": f"Storage service failed: {str(e)}"
            }
    
    async def check_message_queue_health(self) -> Dict[str, any]:
        """Check message queue health."""
        try:
            start_time = time.time()
            
            # For RabbitMQ, check connection
            if hasattr(message_queue.adapter, 'connection') and message_queue.adapter.connection:
                if message_queue.adapter.connection.is_closed:
                    return {
                        "status": "unhealthy",
                        "details": "RabbitMQ connection is closed"
                    }
                
                response_time = time.time() - start_time
                return {
                    "status": "healthy",
                    "response_time_ms": round(response_time * 1000, 2),
                    "details": "Message queue connection active"
                }
            else:
                # Try to connect
                await message_queue.connect()
                response_time = time.time() - start_time
                return {
                    "status": "healthy",
                    "response_time_ms": round(response_time * 1000, 2),
                    "details": "Message queue connection established"
                }
                
        except Exception as e:
            logger.error(f"Message queue health check failed: {e}")
            return {
                "status": "unhealthy",
                "details": f"Message queue failed: {str(e)}"
            }
    
    async def check_system_resources(self) -> Dict[str, any]:
        """Check system resource availability."""
        try:
            import psutil
            
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            
            # Disk usage
            disk = psutil.disk_usage('/')
            
            # Check if resources are within acceptable limits
            resource_status = "healthy"
            warnings = []
            
            if cpu_percent > 90:
                warnings.append(f"High CPU usage: {cpu_percent}%")
                resource_status = "warning"
            
            if memory.percent > 90:
                warnings.append(f"High memory usage: {memory.percent}%")
                resource_status = "warning"
            
            if disk.percent > 90:
                warnings.append(f"High disk usage: {disk.percent}%")
                resource_status = "warning"
            
            return {
                "status": resource_status,
                "cpu_usage_percent": cpu_percent,
                "memory_usage_percent": memory.percent,
                "disk_usage_percent": disk.percent,
                "warnings": warnings,
                "details": "System resources checked"
            }
            
        except Exception as e:
            logger.error(f"System resource check failed: {e}")
            return {
                "status": "unhealthy",
                "details": f"System resource check failed: {str(e)}"
            }
    
    async def perform_comprehensive_health_check(self) -> Dict[str, any]:
        """Perform comprehensive health check of all dependencies."""
        start_time = time.time()
        
        # Run all health checks concurrently
        health_checks = await asyncio.gather(
            self.check_database_health(),
            self.check_redis_health(),
            self.check_storage_health(),
            self.check_message_queue_health(),
            self.check_system_resources(),
            return_exceptions=True
        )
        
        # Process results
        checks = {
            "database": health_checks[0] if not isinstance(health_checks[0], Exception) else {
                "status": "unhealthy", "details": str(health_checks[0])
            },
            "redis": health_checks[1] if not isinstance(health_checks[1], Exception) else {
                "status": "unhealthy", "details": str(health_checks[1])
            },
            "storage": health_checks[2] if not isinstance(health_checks[2], Exception) else {
                "status": "unhealthy", "details": str(health_checks[2])
            },
            "message_queue": health_checks[3] if not isinstance(health_checks[3], Exception) else {
                "status": "unhealthy", "details": str(health_checks[3])
            },
            "system_resources": health_checks[4] if not isinstance(health_checks[4], Exception) else {
                "status": "unhealthy", "details": str(health_checks[4])
            }
        }
        
        # Determine overall health status
        overall_status = "healthy"
        unhealthy_services = []
        warning_services = []
        
        for service, check in checks.items():
            if check["status"] == "unhealthy":
                overall_status = "unhealthy"
                unhealthy_services.append(service)
            elif check["status"] == "warning":
                if overall_status == "healthy":
                    overall_status = "warning"
                warning_services.append(service)
        
        total_time = time.time() - start_time
        self.last_health_check = datetime.utcnow()
        self.health_status = overall_status
        self.dependency_status = checks
        
        return {
            "status": overall_status,
            "timestamp": self.last_health_check.isoformat(),
            "response_time_ms": round(total_time * 1000, 2),
            "service": {
                "name": settings.APP_NAME,
                "version": settings.VERSION,
                "uptime_seconds": round(time.time() - self.start_time, 2)
            },
            "dependencies": checks,
            "summary": {
                "total_dependencies": len(checks),
                "healthy": len([c for c in checks.values() if c["status"] == "healthy"]),
                "warning": len(warning_services),
                "unhealthy": len(unhealthy_services),
                "unhealthy_services": unhealthy_services,
                "warning_services": warning_services
            }
        }
    
    async def check_liveness(self) -> Dict[str, any]:
        """Liveness probe - basic service health."""
        return {
            "status": "alive",
            "timestamp": datetime.utcnow().isoformat(),
            "service": settings.APP_NAME,
            "version": settings.VERSION,
            "uptime_seconds": round(time.time() - self.start_time, 2)
        }
    
    async def check_readiness(self) -> Dict[str, any]:
        """Readiness probe - service ready to handle requests."""
        try:
            # Quick checks for critical dependencies
            db_check = await self.check_database_health()
            redis_check = await self.check_redis_health()
            
            critical_services_healthy = (
                db_check["status"] == "healthy" and 
                redis_check["status"] == "healthy"
            )
            
            if critical_services_healthy:
                return {
                    "status": "ready",
                    "timestamp": datetime.utcnow().isoformat(),
                    "details": "Service is ready to handle requests"
                }
            else:
                return {
                    "status": "not_ready",
                    "timestamp": datetime.utcnow().isoformat(),
                    "details": "Critical dependencies are not healthy",
                    "critical_checks": {
                        "database": db_check["status"],
                        "redis": redis_check["status"]
                    }
                }
                
        except Exception as e:
            logger.error(f"Readiness check failed: {e}")
            return {
                "status": "not_ready",
                "timestamp": datetime.utcnow().isoformat(),
                "details": f"Readiness check failed: {str(e)}"
            }
    
    def get_current_status(self) -> Dict[str, any]:
        """Get current cached health status."""
        return {
            "status": self.health_status,
            "last_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "uptime_seconds": round(time.time() - self.start_time, 2),
            "dependencies": self.dependency_status
        }


# Global health check service
health_service = HealthCheckService()