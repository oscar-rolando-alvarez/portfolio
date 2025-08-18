"""Prometheus metrics collection and custom metrics."""
import asyncio
import time
from typing import Dict, List, Optional

import psutil
from prometheus_client import (
    Counter, Gauge, Histogram, Info, generate_latest, 
    CONTENT_TYPE_LATEST, CollectorRegistry, REGISTRY
)

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MetricsCollector:
    """Custom metrics collector for image processing service."""
    
    def __init__(self, registry: CollectorRegistry = REGISTRY):
        self.registry = registry
        
        # Application info
        self.app_info = Info(
            'image_processing_service_info',
            'Information about the image processing service',
            registry=registry
        )
        self.app_info.info({
            'version': settings.VERSION,
            'name': settings.APP_NAME
        })
        
        # Request metrics
        self.requests_total = Counter(
            'http_requests_total',
            'Total number of HTTP requests',
            ['method', 'endpoint', 'status_code'],
            registry=registry
        )
        
        self.request_duration = Histogram(
            'http_request_duration_seconds',
            'HTTP request duration in seconds',
            ['method', 'endpoint'],
            registry=registry
        )
        
        # Image processing metrics
        self.images_processed_total = Counter(
            'images_processed_total',
            'Total number of images processed',
            ['operation_type', 'status'],
            registry=registry
        )
        
        self.image_processing_duration = Histogram(
            'image_processing_duration_seconds',
            'Image processing duration in seconds',
            ['operation_type'],
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0, float('inf')],
            registry=registry
        )
        
        self.image_size_bytes = Histogram(
            'image_size_bytes',
            'Size of processed images in bytes',
            ['operation_type'],
            buckets=[1024, 10240, 102400, 1048576, 10485760, 52428800, float('inf')],
            registry=registry
        )
        
        # Task queue metrics
        self.tasks_queued = Gauge(
            'tasks_queued_total',
            'Number of tasks currently queued',
            ['task_type'],
            registry=registry
        )
        
        self.tasks_processing = Gauge(
            'tasks_processing_total',
            'Number of tasks currently being processed',
            ['task_type'],
            registry=registry
        )
        
        self.task_processing_duration = Histogram(
            'task_processing_duration_seconds',
            'Task processing duration in seconds',
            ['task_type', 'status'],
            registry=registry
        )
        
        # OCR specific metrics
        self.ocr_text_extracted = Counter(
            'ocr_text_characters_extracted_total',
            'Total number of characters extracted via OCR',
            ['engine', 'language'],
            registry=registry
        )
        
        self.ocr_confidence = Histogram(
            'ocr_confidence_score',
            'OCR confidence scores',
            ['engine'],
            buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
            registry=registry
        )
        
        # Object detection metrics
        self.objects_detected = Counter(
            'objects_detected_total',
            'Total number of objects detected',
            ['model', 'class_name'],
            registry=registry
        )
        
        self.detection_confidence = Histogram(
            'detection_confidence_score',
            'Object detection confidence scores',
            ['model'],
            buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
            registry=registry
        )
        
        # Storage metrics
        self.storage_operations = Counter(
            'storage_operations_total',
            'Total number of storage operations',
            ['operation', 'status'],
            registry=registry
        )
        
        self.storage_operation_duration = Histogram(
            'storage_operation_duration_seconds',
            'Storage operation duration in seconds',
            ['operation'],
            registry=registry
        )
        
        # System metrics
        self.cpu_usage = Gauge(
            'system_cpu_usage_percent',
            'Current CPU usage percentage',
            registry=registry
        )
        
        self.memory_usage = Gauge(
            'system_memory_usage_bytes',
            'Current memory usage in bytes',
            registry=registry
        )
        
        self.memory_usage_percent = Gauge(
            'system_memory_usage_percent',
            'Current memory usage percentage',
            registry=registry
        )
        
        self.disk_usage = Gauge(
            'system_disk_usage_percent',
            'Current disk usage percentage',
            registry=registry
        )
        
        # Rate limiting metrics
        self.rate_limit_exceeded = Counter(
            'rate_limit_exceeded_total',
            'Total number of rate limit violations',
            ['identifier_type'],
            registry=registry
        )
        
        # Circuit breaker metrics
        self.circuit_breaker_state = Gauge(
            'circuit_breaker_state',
            'Circuit breaker state (0=closed, 1=open, 2=half-open)',
            ['breaker_name'],
            registry=registry
        )
        
        self.circuit_breaker_failures = Counter(
            'circuit_breaker_failures_total',
            'Total number of circuit breaker failures',
            ['breaker_name'],
            registry=registry
        )
        
        # Active connections
        self.active_connections = Gauge(
            'active_connections_total',
            'Number of active connections',
            ['connection_type'],
            registry=registry
        )
        
        # Start system metrics collection
        self._start_system_metrics_collection()
    
    def record_request(self, method: str, endpoint: str, status_code: int, duration: float):
        """Record HTTP request metrics."""
        self.requests_total.labels(
            method=method,
            endpoint=endpoint,
            status_code=str(status_code)
        ).inc()
        
        self.request_duration.labels(
            method=method,
            endpoint=endpoint
        ).observe(duration)
    
    def record_image_processing(self, operation_type: str, duration: float, 
                              image_size: int, status: str = "success"):
        """Record image processing metrics."""
        self.images_processed_total.labels(
            operation_type=operation_type,
            status=status
        ).inc()
        
        self.image_processing_duration.labels(
            operation_type=operation_type
        ).observe(duration)
        
        self.image_size_bytes.labels(
            operation_type=operation_type
        ).observe(image_size)
    
    def record_task_processing(self, task_type: str, duration: float, status: str):
        """Record task processing metrics."""
        self.task_processing_duration.labels(
            task_type=task_type,
            status=status
        ).observe(duration)
    
    def update_task_queue(self, task_type: str, queued: int, processing: int):
        """Update task queue metrics."""
        self.tasks_queued.labels(task_type=task_type).set(queued)
        self.tasks_processing.labels(task_type=task_type).set(processing)
    
    def record_ocr_result(self, engine: str, language: str, text_length: int, confidence: float):
        """Record OCR metrics."""
        self.ocr_text_extracted.labels(
            engine=engine,
            language=language
        ).inc(text_length)
        
        self.ocr_confidence.labels(engine=engine).observe(confidence)
    
    def record_object_detection(self, model: str, detections: List[Dict]):
        """Record object detection metrics."""
        for detection in detections:
            self.objects_detected.labels(
                model=model,
                class_name=detection.get('class_name', 'unknown')
            ).inc()
            
            confidence = detection.get('confidence', 0.0)
            self.detection_confidence.labels(model=model).observe(confidence)
    
    def record_storage_operation(self, operation: str, duration: float, status: str = "success"):
        """Record storage operation metrics."""
        self.storage_operations.labels(
            operation=operation,
            status=status
        ).inc()
        
        self.storage_operation_duration.labels(operation=operation).observe(duration)
    
    def record_rate_limit_exceeded(self, identifier_type: str):
        """Record rate limit violation."""
        self.rate_limit_exceeded.labels(identifier_type=identifier_type).inc()
    
    def update_circuit_breaker_state(self, breaker_name: str, state: str):
        """Update circuit breaker state."""
        state_map = {'closed': 0, 'open': 1, 'half_open': 2}
        self.circuit_breaker_state.labels(breaker_name=breaker_name).set(
            state_map.get(state, 0)
        )
    
    def record_circuit_breaker_failure(self, breaker_name: str):
        """Record circuit breaker failure."""
        self.circuit_breaker_failures.labels(breaker_name=breaker_name).inc()
    
    def update_active_connections(self, connection_type: str, count: int):
        """Update active connections count."""
        self.active_connections.labels(connection_type=connection_type).set(count)
    
    def _start_system_metrics_collection(self):
        """Start background system metrics collection."""
        async def collect_system_metrics():
            while True:
                try:
                    # CPU usage
                    cpu_percent = psutil.cpu_percent(interval=1)
                    self.cpu_usage.set(cpu_percent)
                    
                    # Memory usage
                    memory = psutil.virtual_memory()
                    self.memory_usage.set(memory.used)
                    self.memory_usage_percent.set(memory.percent)
                    
                    # Disk usage
                    disk = psutil.disk_usage('/')
                    self.disk_usage.set(disk.percent)
                    
                except Exception as e:
                    logger.error(f"Error collecting system metrics: {e}")
                
                # Wait before next collection
                await asyncio.sleep(30)
        
        # Start the collection task
        asyncio.create_task(collect_system_metrics())
    
    def get_metrics(self) -> str:
        """Get metrics in Prometheus format."""
        return generate_latest(self.registry)
    
    def get_content_type(self) -> str:
        """Get metrics content type."""
        return CONTENT_TYPE_LATEST


# Global metrics collector
metrics_collector = MetricsCollector()


def get_metrics_handler():
    """Get metrics endpoint handler."""
    async def metrics_endpoint():
        return metrics_collector.get_metrics()
    
    return metrics_endpoint


class MetricsMiddleware:
    """Middleware to collect HTTP request metrics."""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        start_time = time.time()
        
        # Extract request info
        method = scope["method"]
        path = scope["path"]
        
        # Skip metrics endpoint to avoid recursion
        if path == settings.PROMETHEUS_METRICS_PATH:
            await self.app(scope, receive, send)
            return
        
        # Wrapper to capture response
        status_code = 500  # Default to error
        
        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)
        
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:
            status_code = 500
            raise
        finally:
            # Record metrics
            duration = time.time() - start_time
            metrics_collector.record_request(method, path, status_code, duration)