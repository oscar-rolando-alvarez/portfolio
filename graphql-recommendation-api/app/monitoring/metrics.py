"""Performance monitoring and metrics collection."""
import time
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from collections import defaultdict, deque
import structlog
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from app.cache import redis_client
from app.config import settings

logger = structlog.get_logger()


class MetricsCollector:
    """Centralized metrics collection and monitoring."""
    
    def __init__(self):
        # Prometheus metrics
        self.request_count = Counter(
            'graphql_requests_total',
            'Total GraphQL requests',
            ['operation_type', 'operation_name', 'tenant_id', 'status']
        )
        
        self.request_duration = Histogram(
            'graphql_request_duration_seconds',
            'GraphQL request duration',
            ['operation_type', 'operation_name', 'tenant_id']
        )
        
        self.recommendation_requests = Counter(
            'recommendation_requests_total',
            'Total recommendation requests',
            ['algorithm', 'tenant_id', 'status']
        )
        
        self.recommendation_duration = Histogram(
            'recommendation_duration_seconds',
            'Recommendation generation duration',
            ['algorithm', 'tenant_id']
        )
        
        self.cache_operations = Counter(
            'cache_operations_total',
            'Cache operations',
            ['operation', 'status']
        )
        
        self.active_connections = Gauge(
            'websocket_connections_active',
            'Active WebSocket connections',
            ['tenant_id']
        )
        
        self.database_operations = Counter(
            'database_operations_total',
            'Database operations',
            ['operation', 'table', 'status']
        )
        
        self.error_count = Counter(
            'errors_total',
            'Total errors',
            ['error_type', 'tenant_id']
        )
        
        # In-memory metrics for real-time monitoring
        self.response_times = deque(maxlen=1000)
        self.error_rates = defaultdict(int)
        self.cache_hit_rates = defaultdict(int)
        self.recommendation_performance = defaultdict(list)
        
        # Background task for metrics aggregation
        self._metrics_task = None
        self._start_background_tasks()
    
    def _start_background_tasks(self):
        """Start background tasks for metrics processing."""
        if not self._metrics_task:
            self._metrics_task = asyncio.create_task(self._metrics_aggregation_loop())
    
    async def _metrics_aggregation_loop(self):
        """Background loop for metrics aggregation and cleanup."""
        while True:
            try:
                await self._aggregate_metrics()
                await asyncio.sleep(60)  # Run every minute
            except Exception as e:
                logger.error(f"Metrics aggregation error: {e}")
                await asyncio.sleep(60)
    
    async def _aggregate_metrics(self):
        """Aggregate and store metrics in Redis."""
        current_time = datetime.utcnow()
        
        # Calculate averages and rates
        if self.response_times:
            avg_response_time = sum(self.response_times) / len(self.response_times)
            await redis_client.set(
                "metrics:avg_response_time",
                avg_response_time,
                expire=3600
            )
        
        # Store error rates
        total_errors = sum(self.error_rates.values())
        await redis_client.set(
            "metrics:total_errors",
            total_errors,
            expire=3600
        )
        
        # Store cache hit rates
        total_cache_ops = sum(self.cache_hit_rates.values())
        cache_hits = self.cache_hit_rates.get('hit', 0)
        cache_hit_rate = (cache_hits / total_cache_ops) if total_cache_ops > 0 else 0
        
        await redis_client.set(
            "metrics:cache_hit_rate",
            cache_hit_rate,
            expire=3600
        )
        
        # Store recommendation performance
        for algorithm, durations in self.recommendation_performance.items():
            if durations:
                avg_duration = sum(durations) / len(durations)
                await redis_client.set(
                    f"metrics:recommendation_avg_duration:{algorithm}",
                    avg_duration,
                    expire=3600
                )
    
    async def record_request(
        self,
        operation_type: str,
        operation_name: Optional[str],
        tenant_id: Optional[str],
        duration: float,
        status: str = "success"
    ):
        """Record a GraphQL request."""
        # Prometheus metrics
        self.request_count.labels(
            operation_type=operation_type,
            operation_name=operation_name or "unknown",
            tenant_id=tenant_id or "unknown",
            status=status
        ).inc()
        
        self.request_duration.labels(
            operation_type=operation_type,
            operation_name=operation_name or "unknown",
            tenant_id=tenant_id or "unknown"
        ).observe(duration)
        
        # In-memory metrics
        self.response_times.append(duration)
        
        # Log structured data
        logger.info(
            "graphql_request",
            operation_type=operation_type,
            operation_name=operation_name,
            tenant_id=tenant_id,
            duration=duration,
            status=status
        )
    
    async def record_recommendation_request(
        self,
        algorithm: str,
        duration: float,
        num_items: int,
        tenant_id: Optional[str] = None,
        status: str = "success"
    ):
        """Record a recommendation request."""
        # Prometheus metrics
        self.recommendation_requests.labels(
            algorithm=algorithm,
            tenant_id=tenant_id or "unknown",
            status=status
        ).inc()
        
        self.recommendation_duration.labels(
            algorithm=algorithm,
            tenant_id=tenant_id or "unknown"
        ).observe(duration / 1000.0)  # Convert ms to seconds
        
        # In-memory metrics
        self.recommendation_performance[algorithm].append(duration)
        if len(self.recommendation_performance[algorithm]) > 100:
            self.recommendation_performance[algorithm].pop(0)
        
        logger.info(
            "recommendation_request",
            algorithm=algorithm,
            duration=duration,
            num_items=num_items,
            tenant_id=tenant_id,
            status=status
        )
    
    async def record_cache_operation(
        self,
        operation: str,
        status: str = "success"
    ):
        """Record a cache operation."""
        self.cache_operations.labels(
            operation=operation,
            status=status
        ).inc()
        
        self.cache_hit_rates[status] += 1
    
    async def record_database_operation(
        self,
        operation: str,
        table: str,
        status: str = "success"
    ):
        """Record a database operation."""
        self.database_operations.labels(
            operation=operation,
            table=table,
            status=status
        ).inc()
    
    async def record_error(
        self,
        error_type: str,
        tenant_id: Optional[str] = None
    ):
        """Record an error."""
        self.error_count.labels(
            error_type=error_type,
            tenant_id=tenant_id or "unknown"
        ).inc()
        
        self.error_rates[error_type] += 1
        
        logger.error(
            "application_error",
            error_type=error_type,
            tenant_id=tenant_id
        )
    
    async def record_websocket_connection(
        self,
        tenant_id: str,
        connected: bool = True
    ):
        """Record WebSocket connection change."""
        if connected:
            self.active_connections.labels(tenant_id=tenant_id).inc()
        else:
            self.active_connections.labels(tenant_id=tenant_id).dec()
    
    async def get_current_metrics(self) -> Dict[str, Any]:
        """Get current metrics summary."""
        # Calculate current rates
        query_count = len(self.response_times)
        avg_response_time = (
            sum(self.response_times) / len(self.response_times)
            if self.response_times else 0.0
        )
        
        total_cache_ops = sum(self.cache_hit_rates.values())
        cache_hits = self.cache_hit_rates.get('hit', 0)
        cache_hit_rate = (cache_hits / total_cache_ops) if total_cache_ops > 0 else 0.0
        
        total_errors = sum(self.error_rates.values())
        error_rate = total_errors / max(query_count, 1)
        
        return {
            "query_count": query_count,
            "average_response_time": avg_response_time,
            "cache_hit_rate": cache_hit_rate,
            "error_rate": error_rate,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def get_recommendation_metrics(self) -> Dict[str, Any]:
        """Get recommendation-specific metrics."""
        metrics = {}
        
        for algorithm, durations in self.recommendation_performance.items():
            if durations:
                metrics[algorithm] = {
                    "average_duration": sum(durations) / len(durations),
                    "min_duration": min(durations),
                    "max_duration": max(durations),
                    "request_count": len(durations)
                }
        
        return metrics
    
    async def get_health_status(self) -> Dict[str, Any]:
        """Get system health status."""
        current_metrics = await self.get_current_metrics()
        
        # Health thresholds
        health_status = "healthy"
        issues = []
        
        # Check response time
        if current_metrics["average_response_time"] > 1.0:  # 1 second
            health_status = "degraded"
            issues.append("High response time")
        
        # Check error rate
        if current_metrics["error_rate"] > 0.05:  # 5%
            health_status = "unhealthy"
            issues.append("High error rate")
        
        # Check cache hit rate
        if current_metrics["cache_hit_rate"] < 0.8:  # 80%
            if health_status == "healthy":
                health_status = "degraded"
            issues.append("Low cache hit rate")
        
        return {
            "status": health_status,
            "issues": issues,
            "metrics": current_metrics,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def get_prometheus_metrics(self) -> str:
        """Get Prometheus metrics in text format."""
        return generate_latest()


class PerformanceTracker:
    """Context manager for tracking operation performance."""
    
    def __init__(
        self,
        metrics_collector: MetricsCollector,
        operation_type: str,
        operation_name: Optional[str] = None,
        tenant_id: Optional[str] = None
    ):
        self.metrics_collector = metrics_collector
        self.operation_type = operation_type
        self.operation_name = operation_name
        self.tenant_id = tenant_id
        self.start_time = None
        self.status = "success"
    
    async def __aenter__(self):
        self.start_time = time.time()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.start_time:
            duration = time.time() - self.start_time
            
            if exc_type:
                self.status = "error"
                await self.metrics_collector.record_error(
                    error_type=str(exc_type.__name__),
                    tenant_id=self.tenant_id
                )
            
            await self.metrics_collector.record_request(
                operation_type=self.operation_type,
                operation_name=self.operation_name,
                tenant_id=self.tenant_id,
                duration=duration,
                status=self.status
            )
    
    def set_status(self, status: str):
        """Set the operation status."""
        self.status = status


class AlertManager:
    """Manages performance alerts and notifications."""
    
    def __init__(self, metrics_collector: MetricsCollector):
        self.metrics_collector = metrics_collector
        self.alert_thresholds = {
            "high_response_time": 2.0,  # seconds
            "high_error_rate": 0.1,     # 10%
            "low_cache_hit_rate": 0.7,  # 70%
            "high_recommendation_latency": 5000.0  # 5 seconds in ms
        }
        self.alert_cooldowns = defaultdict(int)
        self.cooldown_period = 300  # 5 minutes
    
    async def check_alerts(self):
        """Check for alert conditions."""
        current_time = int(time.time())
        health_status = await self.metrics_collector.get_health_status()
        
        # Check response time alert
        avg_response_time = health_status["metrics"]["average_response_time"]
        if (avg_response_time > self.alert_thresholds["high_response_time"] and
            current_time > self.alert_cooldowns["high_response_time"]):
            
            await self._send_alert(
                "high_response_time",
                f"High response time detected: {avg_response_time:.2f}s"
            )
            self.alert_cooldowns["high_response_time"] = current_time + self.cooldown_period
        
        # Check error rate alert
        error_rate = health_status["metrics"]["error_rate"]
        if (error_rate > self.alert_thresholds["high_error_rate"] and
            current_time > self.alert_cooldowns["high_error_rate"]):
            
            await self._send_alert(
                "high_error_rate",
                f"High error rate detected: {error_rate:.2%}"
            )
            self.alert_cooldowns["high_error_rate"] = current_time + self.cooldown_period
        
        # Check cache hit rate alert
        cache_hit_rate = health_status["metrics"]["cache_hit_rate"]
        if (cache_hit_rate < self.alert_thresholds["low_cache_hit_rate"] and
            current_time > self.alert_cooldowns["low_cache_hit_rate"]):
            
            await self._send_alert(
                "low_cache_hit_rate",
                f"Low cache hit rate detected: {cache_hit_rate:.2%}"
            )
            self.alert_cooldowns["low_cache_hit_rate"] = current_time + self.cooldown_period
    
    async def _send_alert(self, alert_type: str, message: str):
        """Send alert notification."""
        # Log alert
        logger.warning(
            "performance_alert",
            alert_type=alert_type,
            message=message
        )
        
        # Here you would integrate with notification services like:
        # - Slack
        # - PagerDuty
        # - Email
        # - SMS
        
        # For now, just store in Redis for dashboard display
        alert_data = {
            "type": alert_type,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        await redis_client.lpush("alerts", alert_data)
        await redis_client.ltrim("alerts", 0, 99)  # Keep last 100 alerts


# Global instances
metrics_collector = MetricsCollector()
alert_manager = AlertManager(metrics_collector)