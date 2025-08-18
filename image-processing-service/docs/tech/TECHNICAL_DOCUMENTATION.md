# Image Processing Microservice - Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Event-Driven Architecture](#event-driven-architecture)
3. [Microservice Design Patterns](#microservice-design-patterns)
4. [Image Processing Pipeline](#image-processing-pipeline)
5. [Message Queue Implementation](#message-queue-implementation)
6. [Worker Architecture and Scaling](#worker-architecture-and-scaling)
7. [Rate Limiting Implementation](#rate-limiting-implementation)
8. [Circuit Breaker Pattern](#circuit-breaker-pattern)
9. [Cloud Storage Integration](#cloud-storage-integration)
10. [Monitoring and Logging](#monitoring-and-logging)
11. [Kubernetes Deployment](#kubernetes-deployment)
12. [Performance Optimizations](#performance-optimizations)
13. [Health Checks and Resilience](#health-checks-and-resilience)
14. [Security Considerations](#security-considerations)

## System Overview

The Image Processing Microservice is a highly scalable, cloud-native application designed to handle intensive image processing operations using an event-driven architecture. The system is built with Python 3.11+ using FastAPI and implements modern microservice patterns for reliability, scalability, and maintainability.

### Key Technologies
- **Framework**: FastAPI with async/await patterns
- **Image Processing**: OpenCV, PIL (Pillow), scikit-image
- **OCR Engines**: Tesseract, EasyOCR
- **Object Detection**: YOLO v8 (Ultralytics), PyTorch
- **Message Queues**: RabbitMQ, Apache Kafka
- **Storage**: S3-compatible (AWS S3, MinIO)
- **Databases**: PostgreSQL (async), Redis
- **Orchestration**: Kubernetes, Docker
- **Monitoring**: Prometheus, Grafana

### Architecture Principles
- **Asynchronous Processing**: All I/O operations are non-blocking
- **Event-Driven Design**: Loose coupling through message queues
- **Horizontal Scalability**: Stateless components with automatic scaling
- **Fault Tolerance**: Circuit breakers, retry mechanisms, health checks
- **Observability**: Comprehensive metrics, logging, and tracing

## Event-Driven Architecture

### Core Components

#### API Gateway Layer
```python
# FastAPI application with middleware stack
app = FastAPI(
    title="Image Processing Service",
    version="1.0.0",
    lifespan=lifespan
)

# Middleware stack
app.add_middleware(CorrelationIDMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware)
```

#### Message Flow Architecture
```
Client Request → API Gateway → Message Queue → Worker Pool → Storage → Response
                     ↓
              Correlation ID → Metrics Collection → Circuit Breaker
```

### Event Types
1. **Image Upload Events**: Triggered when images are uploaded
2. **Processing Tasks**: Resize, crop, filter, OCR, object detection
3. **Batch Processing**: Multiple operations on multiple images
4. **Result Events**: Success/failure notifications
5. **Health Events**: System status and metrics

### Message Queue Integration

#### RabbitMQ Implementation
```python
class RabbitMQAdapter(MessageQueueInterface):
    async def connect(self):
        self.connection = await connect_robust(self.url)
        self.channel = await self.connection.channel()
        self.exchange = await self.channel.declare_exchange(
            "image_processing",
            ExchangeType.TOPIC,
            durable=True
        )

    async def publish(self, topic: str, message: Dict[str, Any], routing_key: str = None):
        message_body = json.dumps(message).encode()
        rabbitmq_message = Message(
            message_body,
            content_type="application/json",
            delivery_mode=2  # Persistent
        )
        await self.exchange.publish(rabbitmq_message, routing_key=routing_key)
```

#### Kafka Implementation
```python
class KafkaAdapter(MessageQueueInterface):
    async def connect(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        await self.producer.start()

    async def publish(self, topic: str, message: Dict[str, Any]):
        full_topic = f"{settings.KAFKA_TOPIC_PREFIX}.{topic}"
        await self.producer.send_and_wait(full_topic, message)
```

## Microservice Design Patterns

### Circuit Breaker Pattern

The service implements the Circuit Breaker pattern to handle external service failures gracefully:

```python
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        async with self._lock:
            await self._check_state()
            
            if self._state == CircuitBreakerState.OPEN:
                raise CircuitBreakerError(f"Circuit breaker is OPEN")
        
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except self.expected_exception as e:
            await self._on_failure()
            raise e
```

### Retry Mechanism with Exponential Backoff

```python
@circuit_breaker(name="storage_upload", failure_threshold=3, recovery_timeout=30)
async def upload_file(self, file_data: bytes, key: str):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return await self._do_upload(file_data, key)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)  # Exponential backoff
```

### Rate Limiting with Sliding Window

```python
class RateLimiter:
    async def is_allowed(self, identifier: str, limit: int, window: int = 60):
        now = time.time()
        window_start = now - window
        
        # Remove old entries and count current requests
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(requests_key, 0, window_start)
        pipe.zcard(requests_key)
        pipe.zadd(requests_key, {str(now): now})
        pipe.expire(requests_key, window + 10)
        
        results = await pipe.execute()
        current_requests = results[1]
        
        return current_requests < limit
```

## Image Processing Pipeline

### Core Processing Engine

```python
class ImageProcessor:
    async def resize_image(self, image_data: bytes, width: int, height: int, 
                          maintain_aspect_ratio: bool = True):
        image = Image.open(io.BytesIO(image_data))
        
        if maintain_aspect_ratio:
            original_width, original_height = image.size
            aspect_ratio = original_width / original_height
            
            if width / height > aspect_ratio:
                new_width = int(height * aspect_ratio)
                new_height = height
            else:
                new_width = width
                new_height = int(width / aspect_ratio)
        else:
            new_width, new_height = width, height
        
        resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        return self._save_image(resized_image, output_format, quality)
```

### Advanced Filter Implementation

```python
async def apply_filter(self, image_data: bytes, filter_type: FilterType, intensity: float):
    image = Image.open(io.BytesIO(image_data))
    
    if filter_type == FilterType.EDGE_DETECTION:
        # OpenCV implementation for better performance
        cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, int(50 * intensity), int(150 * intensity))
        filtered_image = Image.fromarray(edges).convert('RGB')
    
    elif filter_type == FilterType.GAUSSIAN_BLUR:
        filtered_image = image.filter(ImageFilter.GaussianBlur(radius=intensity * 2))
    
    # Additional filters...
    return self._save_image(filtered_image, output_format, quality)
```

### OCR Implementation with Multiple Engines

```python
class OCRService:
    async def extract_text_hybrid(self, image_data: bytes, languages: List[str]):
        # Run both engines concurrently for better accuracy
        tesseract_task = asyncio.create_task(
            self.extract_text_tesseract(image_data, languages)
        )
        easyocr_task = asyncio.create_task(
            self.extract_text_easyocr(image_data, languages)
        )
        
        tesseract_results, easyocr_results = await asyncio.gather(
            tesseract_task, easyocr_task, return_exceptions=True
        )
        
        return {
            'tesseract': tesseract_results if not isinstance(tesseract_results, Exception) else [],
            'easyocr': easyocr_results if not isinstance(easyocr_results, Exception) else []
        }
```

### Object Detection with YOLO

```python
class ObjectDetectionService:
    async def detect_objects_yolo(self, image_data: bytes, confidence_threshold: float):
        model = await self._load_yolo_model()
        
        # Convert image data to numpy array
        image_array = np.frombuffer(image_data, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        # Run inference
        results = model(image, conf=confidence_threshold, verbose=False)
        
        detected_objects = []
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                xyxy = boxes.xyxy.cpu().numpy()
                conf = boxes.conf.cpu().numpy()
                cls = boxes.cls.cpu().numpy()
                
                for i in range(len(xyxy)):
                    class_name = self.coco_classes[int(cls[i])]
                    x1, y1, x2, y2 = xyxy[i]
                    
                    detected_objects.append(DetectedObject(
                        class_name=class_name,
                        confidence=float(conf[i]),
                        bbox=BoundingBox(x1=float(x1), y1=float(y1), 
                                       x2=float(x2), y2=float(y2), 
                                       confidence=float(conf[i]))
                    ))
        
        return detected_objects
```

## Worker Architecture and Scaling

### Task Processor Design

```python
class TaskProcessor:
    def __init__(self, worker_id: str = None):
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"
        self.running = False
        self.processed_count = 0
        self.error_count = 0

    async def process_task(self, task_data: Dict[str, Any]):
        task_id = task_data.get("task_id")
        correlation_id = task_data.get("correlation_id", str(uuid.uuid4()))
        
        set_correlation_id(correlation_id)
        start_time = time.time()
        
        try:
            await self._update_task_status(task_id, ProcessingStatus.PROCESSING)
            
            task_type = task_data.get("task_type")
            result = await self._execute_task(task_type, task_data)
            
            processing_time = time.time() - start_time
            await self._update_task_completion(task_id, result, processing_time)
            
            # Publish result to message queue
            await message_queue.publish_result(task_id, {
                "status": "completed",
                "result": result,
                "processing_time": processing_time,
                "worker_id": self.worker_id
            })
            
            metrics_collector.record_task_processing(task_type, processing_time, "success")
            self.processed_count += 1
            
        except Exception as e:
            await self._handle_task_error(task_id, e, time.time() - start_time)
```

### Horizontal Pod Autoscaling Configuration

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: image-processing-hpa
  namespace: image-processing
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: image-processing-worker
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: tasks_queued_total
      target:
        type: AverageValue
        averageValue: "5"
```

## Cloud Storage Integration

### S3-Compatible Storage Service

```python
class StorageService:
    @circuit_breaker(name="storage_upload", failure_threshold=3, recovery_timeout=30)
    async def upload_file(self, file_data: bytes, key: str, content_type: str = None):
        async with await self._get_client() as s3:
            await self._ensure_bucket_exists(s3)
            
            upload_params = {
                'Bucket': self.bucket_name,
                'Key': key,
                'Body': file_data,
            }
            
            if content_type:
                upload_params['ContentType'] = content_type
            
            await s3.put_object(**upload_params)
            return await self.generate_url(key)

    async def generate_presigned_url(self, key: str, expiration: int = 3600):
        async with await self._get_client() as s3:
            url = await s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=expiration
            )
            return url
```

### File Management and Cleanup

```python
def generate_file_key(self, file_extension: str, prefix: str = "images", use_hash: bool = True):
    timestamp = datetime.utcnow().strftime("%Y/%m/%d")
    
    if use_hash:
        hash_input = f"{datetime.utcnow().isoformat()}-{os.urandom(16).hex()}"
        filename = hashlib.sha256(hash_input.encode()).hexdigest()[:16]
    else:
        filename = datetime.utcnow().strftime("%H%M%S_%f")
    
    return f"{prefix}/{timestamp}/{filename}.{file_extension.lower()}"
```

## Monitoring and Logging

### Prometheus Metrics Implementation

```python
class MetricsCollector:
    def __init__(self):
        # HTTP request metrics
        self.requests_total = Counter(
            'http_requests_total',
            'Total number of HTTP requests',
            ['method', 'endpoint', 'status_code']
        )
        
        # Image processing metrics
        self.image_processing_duration = Histogram(
            'image_processing_duration_seconds',
            'Image processing duration in seconds',
            ['operation_type'],
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0, float('inf')]
        )
        
        # Task queue metrics
        self.tasks_queued = Gauge(
            'tasks_queued_total',
            'Number of tasks currently queued',
            ['task_type']
        )
        
        # OCR specific metrics
        self.ocr_text_extracted = Counter(
            'ocr_text_characters_extracted_total',
            'Total number of characters extracted via OCR',
            ['engine', 'language']
        )

    def record_image_processing(self, operation_type: str, duration: float, image_size: int):
        self.images_processed_total.labels(
            operation_type=operation_type, status="success"
        ).inc()
        
        self.image_processing_duration.labels(
            operation_type=operation_type
        ).observe(duration)
```

### Structured Logging with Correlation IDs

```python
import structlog

def configure_logging():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="ISO"),
            structlog.dev.ConsoleRenderer() if settings.DEBUG else structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.WriteLoggerFactory(),
        cache_logger_on_first_use=True,
    )

# Correlation ID middleware
class CorrelationIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        set_correlation_id(correlation_id)
        
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response
```

## Kubernetes Deployment

### Deployment Strategy

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: image-processing-app
  namespace: image-processing
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: app
        image: image-processing-service:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 10
```

### Service Mesh Integration

```yaml
apiVersion: v1
kind: Service
metadata:
  name: image-processing-service
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8000"
    prometheus.io/path: "/metrics"
spec:
  selector:
    app: image-processing
    component: api
  ports:
  - name: http
    port: 80
    targetPort: 8000
  type: ClusterIP
```

## Performance Optimizations

### Connection Pooling and Resource Management

```python
# AsyncPG connection pool
async def init_db():
    global db_pool
    db_pool = await asyncpg.create_pool(
        settings.DATABASE_URL,
        min_size=5,
        max_size=20,
        command_timeout=60
    )

# Redis connection pool
async def init_redis():
    redis_pool = aioredis.ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=20,
        retry_on_timeout=True
    )
    return aioredis.Redis(connection_pool=redis_pool)
```

### Image Processing Optimizations

```python
# Lazy model loading for YOLO
class ObjectDetectionService:
    async def _load_yolo_model(self):
        if self.yolo_model is None:
            self.yolo_model = YOLO(self.model_path)
            self.yolo_model.to(self.device)  # GPU if available
        return self.yolo_model

# Memory-efficient image processing
async def process_large_image(self, image_data: bytes):
    # Process in chunks for large images
    image = Image.open(io.BytesIO(image_data))
    if image.size[0] * image.size[1] > 10000000:  # 10MP threshold
        # Implement tiled processing
        return await self._process_tiled(image)
    else:
        return await self._process_standard(image)
```

### Caching Strategy

```python
@cached(ttl=3600)  # 1 hour cache
async def get_image_metadata(self, image_key: str):
    # Cache expensive metadata operations
    return await storage_service.get_file_info(image_key)

# Redis caching for frequent operations
async def cache_processing_result(self, task_id: str, result: dict):
    await redis.setex(
        f"result:{task_id}",
        300,  # 5 minutes TTL
        json.dumps(result)
    )
```

## Health Checks and Resilience

### Comprehensive Health Check Implementation

```python
class HealthService:
    async def check_database(self) -> Dict[str, Any]:
        try:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return {"status": "healthy", "response_time": response_time}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    async def check_message_queue(self) -> Dict[str, Any]:
        try:
            # Test message queue connectivity
            await message_queue.adapter.connection.is_closed
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    async def check_storage(self) -> Dict[str, Any]:
        try:
            # Test S3 connectivity
            await storage_service.file_exists("health-check-dummy")
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

    async def get_comprehensive_health(self) -> Dict[str, Any]:
        checks = await asyncio.gather(
            self.check_database(),
            self.check_message_queue(),
            self.check_storage(),
            return_exceptions=True
        )
        
        overall_status = "healthy" if all(
            check.get("status") == "healthy" for check in checks 
            if isinstance(check, dict)
        ) else "unhealthy"
        
        return {
            "status": overall_status,
            "timestamp": datetime.utcnow().isoformat(),
            "version": settings.VERSION,
            "dependencies": {
                "database": checks[0],
                "message_queue": checks[1],
                "storage": checks[2]
            }
        }
```

### Graceful Shutdown

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Image Processing Service")
    
    try:
        await init_db()
        await message_queue.connect()
        logger.info("Service started successfully")
    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Image Processing Service")
    
    try:
        # Graceful shutdown sequence
        await message_queue.disconnect()
        await close_db()
        logger.info("Service shut down complete")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
```

## Security Considerations

### Input Validation and Sanitization

```python
class ImageValidation:
    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'}
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    MAX_DIMENSIONS = (10000, 10000)

    @staticmethod
    async def validate_upload(file: UploadFile) -> Tuple[bool, str]:
        # Validate file type
        if not file.content_type or not file.content_type.startswith("image/"):
            return False, "Invalid file type"
        
        # Validate file extension
        extension = file.filename.split('.')[-1].lower()
        if extension not in ImageValidation.ALLOWED_EXTENSIONS:
            return False, f"Unsupported extension: {extension}"
        
        # Validate file size
        file_data = await file.read()
        if len(file_data) > ImageValidation.MAX_FILE_SIZE:
            return False, "File too large"
        
        # Validate image content
        try:
            image = Image.open(io.BytesIO(file_data))
            if image.size[0] > ImageValidation.MAX_DIMENSIONS[0] or \
               image.size[1] > ImageValidation.MAX_DIMENSIONS[1]:
                return False, "Image dimensions too large"
        except Exception:
            return False, "Invalid image format"
        
        return True, "Valid"
```

### API Authentication and Authorization

```python
# Rate limiting by API key
class RateLimitMiddleware(BaseHTTPMiddleware):
    async def _get_identifier(self, request: Request) -> Optional[str]:
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return f"api_key:{api_key}"
        
        client_ip = request.client.host if request.client else None
        if client_ip:
            return f"ip:{client_ip}"
        
        return None

    async def _get_rate_limit_config(self, identifier: str) -> tuple[int, int]:
        if identifier.startswith("api_key:"):
            # TODO: Lookup API key specific limits from database
            return 1000, 50  # Higher limits for authenticated users
        else:
            return settings.RATE_LIMIT_PER_MINUTE, settings.RATE_LIMIT_BURST
```

### Container Security

```dockerfile
# Multi-stage build for smaller attack surface
FROM python:3.11-slim as builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.11-slim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy dependencies from builder stage
COPY --from=builder /root/.local /home/appuser/.local

# Set up application
WORKDIR /app
COPY --chown=appuser:appuser . .

# Switch to non-root user
USER appuser

# Make sure scripts in .local are usable
ENV PATH=/home/appuser/.local/bin:$PATH

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Conclusion

This technical documentation provides a comprehensive overview of the Image Processing Microservice architecture. The system demonstrates modern cloud-native patterns including:

- **Event-driven architecture** with reliable message queuing
- **Circuit breaker pattern** for fault tolerance
- **Horizontal scaling** with Kubernetes HPA
- **Comprehensive monitoring** with Prometheus metrics
- **Security-first design** with input validation and rate limiting
- **High availability** through health checks and graceful shutdown

The service is designed to handle production workloads with high throughput, reliability, and observability requirements while maintaining code quality and maintainability standards.