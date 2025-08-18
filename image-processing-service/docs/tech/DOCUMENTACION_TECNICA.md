# Microservicio de Procesamiento de Imágenes - Documentación Técnica

## Tabla de Contenidos
1. [Visión General del Sistema](#visión-general-del-sistema)
2. [Arquitectura Dirigida por Eventos](#arquitectura-dirigida-por-eventos)
3. [Patrones de Diseño de Microservicios](#patrones-de-diseño-de-microservicios)
4. [Pipeline de Procesamiento de Imágenes](#pipeline-de-procesamiento-de-imágenes)
5. [Implementación de Colas de Mensajes](#implementación-de-colas-de-mensajes)
6. [Arquitectura de Workers y Escalado](#arquitectura-de-workers-y-escalado)
7. [Implementación de Rate Limiting](#implementación-de-rate-limiting)
8. [Patrón Circuit Breaker](#patrón-circuit-breaker)
9. [Integración con Almacenamiento en la Nube](#integración-con-almacenamiento-en-la-nube)
10. [Monitoreo y Logging](#monitoreo-y-logging)
11. [Despliegue en Kubernetes](#despliegue-en-kubernetes)
12. [Optimizaciones de Rendimiento](#optimizaciones-de-rendimiento)
13. [Health Checks y Resiliencia](#health-checks-y-resiliencia)
14. [Consideraciones de Seguridad](#consideraciones-de-seguridad)

## Visión General del Sistema

El Microservicio de Procesamiento de Imágenes es una aplicación altamente escalable y nativa de la nube, diseñada para manejar operaciones intensivas de procesamiento de imágenes utilizando una arquitectura dirigida por eventos. El sistema está construido con Python 3.11+ usando FastAPI e implementa patrones modernos de microservicios para confiabilidad, escalabilidad y mantenibilidad.

### Tecnologías Clave
- **Framework**: FastAPI con patrones async/await
- **Procesamiento de Imágenes**: OpenCV, PIL (Pillow), scikit-image
- **Motores OCR**: Tesseract, EasyOCR
- **Detección de Objetos**: YOLO v8 (Ultralytics), PyTorch
- **Colas de Mensajes**: RabbitMQ, Apache Kafka
- **Almacenamiento**: Compatible con S3 (AWS S3, MinIO)
- **Bases de Datos**: PostgreSQL (async), Redis
- **Orquestación**: Kubernetes, Docker
- **Monitoreo**: Prometheus, Grafana

### Principios Arquitectónicos
- **Procesamiento Asíncrono**: Todas las operaciones I/O son no bloqueantes
- **Diseño Dirigido por Eventos**: Bajo acoplamiento a través de colas de mensajes
- **Escalabilidad Horizontal**: Componentes sin estado con escalado automático
- **Tolerancia a Fallos**: Circuit breakers, mecanismos de reintentos, health checks
- **Observabilidad**: Métricas completas, logging y trazabilidad

## Arquitectura Dirigida por Eventos

### Componentes Principales

#### Capa API Gateway
```python
# Aplicación FastAPI con stack de middleware
app = FastAPI(
    title="Image Processing Service",
    version="1.0.0",
    lifespan=lifespan
)

# Stack de middleware
app.add_middleware(CorrelationIDMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware)
```

#### Arquitectura de Flujo de Mensajes
```
Petición Cliente → API Gateway → Cola de Mensajes → Pool de Workers → Almacenamiento → Respuesta
                       ↓
                Correlation ID → Recolección de Métricas → Circuit Breaker
```

### Tipos de Eventos
1. **Eventos de Subida de Imágenes**: Activados cuando se suben imágenes
2. **Tareas de Procesamiento**: Redimensionar, recortar, filtros, OCR, detección de objetos
3. **Procesamiento por Lotes**: Múltiples operaciones en múltiples imágenes
4. **Eventos de Resultado**: Notificaciones de éxito/fallo
5. **Eventos de Salud**: Estado del sistema y métricas

### Integración de Colas de Mensajes

#### Implementación RabbitMQ
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
            delivery_mode=2  # Persistente
        )
        await self.exchange.publish(rabbitmq_message, routing_key=routing_key)
```

#### Implementación Kafka
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

## Patrones de Diseño de Microservicios

### Patrón Circuit Breaker

El servicio implementa el patrón Circuit Breaker para manejar fallos de servicios externos de manera elegante:

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
                raise CircuitBreakerError(f"Circuit breaker está ABIERTO")
        
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except self.expected_exception as e:
            await self._on_failure()
            raise e
```

### Mecanismo de Reintentos con Backoff Exponencial

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
            await asyncio.sleep(2 ** attempt)  # Backoff exponencial
```

### Rate Limiting con Ventana Deslizante

```python
class RateLimiter:
    async def is_allowed(self, identifier: str, limit: int, window: int = 60):
        now = time.time()
        window_start = now - window
        
        # Eliminar entradas antiguas y contar peticiones actuales
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(requests_key, 0, window_start)
        pipe.zcard(requests_key)
        pipe.zadd(requests_key, {str(now): now})
        pipe.expire(requests_key, window + 10)
        
        results = await pipe.execute()
        current_requests = results[1]
        
        return current_requests < limit
```

## Pipeline de Procesamiento de Imágenes

### Motor de Procesamiento Principal

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

### Implementación de Filtros Avanzados

```python
async def apply_filter(self, image_data: bytes, filter_type: FilterType, intensity: float):
    image = Image.open(io.BytesIO(image_data))
    
    if filter_type == FilterType.EDGE_DETECTION:
        # Implementación OpenCV para mejor rendimiento
        cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, int(50 * intensity), int(150 * intensity))
        filtered_image = Image.fromarray(edges).convert('RGB')
    
    elif filter_type == FilterType.GAUSSIAN_BLUR:
        filtered_image = image.filter(ImageFilter.GaussianBlur(radius=intensity * 2))
    
    # Filtros adicionales...
    return self._save_image(filtered_image, output_format, quality)
```

### Implementación OCR con Múltiples Motores

```python
class OCRService:
    async def extract_text_hybrid(self, image_data: bytes, languages: List[str]):
        # Ejecutar ambos motores concurrentemente para mejor precisión
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

### Detección de Objetos con YOLO

```python
class ObjectDetectionService:
    async def detect_objects_yolo(self, image_data: bytes, confidence_threshold: float):
        model = await self._load_yolo_model()
        
        # Convertir datos de imagen a array numpy
        image_array = np.frombuffer(image_data, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        # Ejecutar inferencia
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

## Arquitectura de Workers y Escalado

### Diseño del Procesador de Tareas

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
            
            # Publicar resultado a la cola de mensajes
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

### Configuración de Horizontal Pod Autoscaling

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

## Integración con Almacenamiento en la Nube

### Servicio de Almacenamiento Compatible con S3

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

## Monitoreo y Logging

### Implementación de Métricas Prometheus

```python
class MetricsCollector:
    def __init__(self):
        # Métricas de peticiones HTTP
        self.requests_total = Counter(
            'http_requests_total',
            'Número total de peticiones HTTP',
            ['method', 'endpoint', 'status_code']
        )
        
        # Métricas de procesamiento de imágenes
        self.image_processing_duration = Histogram(
            'image_processing_duration_seconds',
            'Duración del procesamiento de imágenes en segundos',
            ['operation_type'],
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0, float('inf')]
        )
        
        # Métricas de cola de tareas
        self.tasks_queued = Gauge(
            'tasks_queued_total',
            'Número de tareas actualmente en cola',
            ['task_type']
        )

    def record_image_processing(self, operation_type: str, duration: float, image_size: int):
        self.images_processed_total.labels(
            operation_type=operation_type, status="success"
        ).inc()
        
        self.image_processing_duration.labels(
            operation_type=operation_type
        ).observe(duration)
```

### Logging Estructurado con IDs de Correlación

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

# Middleware de Correlation ID
class CorrelationIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        set_correlation_id(correlation_id)
        
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response
```

## Despliegue en Kubernetes

### Estrategia de Despliegue

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

## Optimizaciones de Rendimiento

### Pooling de Conexiones y Gestión de Recursos

```python
# Pool de conexiones AsyncPG
async def init_db():
    global db_pool
    db_pool = await asyncpg.create_pool(
        settings.DATABASE_URL,
        min_size=5,
        max_size=20,
        command_timeout=60
    )

# Pool de conexiones Redis
async def init_redis():
    redis_pool = aioredis.ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=20,
        retry_on_timeout=True
    )
    return aioredis.Redis(connection_pool=redis_pool)
```

### Optimizaciones de Procesamiento de Imágenes

```python
# Carga perezosa de modelos YOLO
class ObjectDetectionService:
    async def _load_yolo_model(self):
        if self.yolo_model is None:
            self.yolo_model = YOLO(self.model_path)
            self.yolo_model.to(self.device)  # GPU si está disponible
        return self.yolo_model

# Procesamiento eficiente en memoria para imágenes
async def process_large_image(self, image_data: bytes):
    # Procesar en chunks para imágenes grandes
    image = Image.open(io.BytesIO(image_data))
    if image.size[0] * image.size[1] > 10000000:  # Umbral de 10MP
        # Implementar procesamiento en mosaicos
        return await self._process_tiled(image)
    else:
        return await self._process_standard(image)
```

## Health Checks y Resiliencia

### Implementación Completa de Health Checks

```python
class HealthService:
    async def check_database(self) -> Dict[str, Any]:
        try:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return {"status": "healthy", "response_time": response_time}
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

## Consideraciones de Seguridad

### Validación y Sanitización de Entrada

```python
class ImageValidation:
    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp'}
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    MAX_DIMENSIONS = (10000, 10000)

    @staticmethod
    async def validate_upload(file: UploadFile) -> Tuple[bool, str]:
        # Validar tipo de archivo
        if not file.content_type or not file.content_type.startswith("image/"):
            return False, "Tipo de archivo inválido"
        
        # Validar extensión
        extension = file.filename.split('.')[-1].lower()
        if extension not in ImageValidation.ALLOWED_EXTENSIONS:
            return False, f"Extensión no soportada: {extension}"
        
        # Validar tamaño
        file_data = await file.read()
        if len(file_data) > ImageValidation.MAX_FILE_SIZE:
            return False, "Archivo demasiado grande"
        
        return True, "Válido"
```

## Conclusión

Esta documentación técnica proporciona una visión completa de la arquitectura del Microservicio de Procesamiento de Imágenes. El sistema demuestra patrones modernos nativos de la nube incluyendo:

- **Arquitectura dirigida por eventos** con colas de mensajes confiables
- **Patrón circuit breaker** para tolerancia a fallos
- **Escalado horizontal** con Kubernetes HPA
- **Monitoreo integral** con métricas Prometheus
- **Diseño security-first** con validación de entrada y rate limiting
- **Alta disponibilidad** a través de health checks y apagado elegante

El servicio está diseñado para manejar cargas de trabajo de producción con alta eficiencia, confiabilidad y requisitos de observabilidad, manteniendo estándares de calidad de código y mantenibilidad.