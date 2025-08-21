# Image Processing Microservice

A scalable, production-ready Python microservice for image processing with AI capabilities, built with FastAPI and designed for high throughput with horizontal scaling.

## Features

### Core Image Processing
- **Multiple Filters**: Blur, sharpen, edge detection, Gaussian blur, median filter, emboss, contour
- **Resizing and Cropping**: Maintain aspect ratio, exact dimensions, smart cropping
- **Image Enhancement**: Brightness, contrast, saturation, sharpness adjustments
- **Format Conversion**: Support for JPEG, PNG, WebP, BMP, TIFF
- **Batch Processing**: Process multiple images with multiple operations

### AI Capabilities
- **OCR Text Extraction**: Using Tesseract and EasyOCR engines
- **Object Detection**: YOLO-based object detection with pre-trained models
- **Face Detection**: OpenCV Haar cascades for face detection
- **Image Analysis**: Color analysis, texture analysis, composition metrics

### Architecture & Scalability
- **Event-Driven Architecture**: RabbitMQ/Apache Kafka message queuing
- **Async Processing**: FastAPI with async endpoints and worker pools
- **Cloud Storage**: S3-compatible storage (AWS S3/MinIO)
- **Horizontal Scaling**: Kubernetes-ready with auto-scaling
- **Circuit Breaker**: Resilient external service calls
- **Rate Limiting**: Per-user/API key rate limiting with Redis

### Monitoring & Observability
- **Prometheus Metrics**: Custom application and system metrics
- **Structured Logging**: JSON logs with correlation IDs
- **Health Checks**: Kubernetes liveness and readiness probes
- **Distributed Tracing**: OpenTelemetry integration ready

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   API Gateway   │────│   FastAPI App   │
│   (Nginx/K8s)   │    │  (Rate Limit)   │    │  (3+ replicas)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌─────────────────────────────────┼─────────────────────────────────┐
                       │                                 │                                 │
                       ▼                                 ▼                                 ▼
              ┌─────────────────┐               ┌─────────────────┐               ┌─────────────────┐
              │  Message Queue  │               │  Worker Pool    │               │  Storage Layer  │
              │ (RabbitMQ/Kafka)│               │ (5+ workers)    │               │   (S3/MinIO)    │
              └─────────────────┘               └─────────────────┘               └─────────────────┘
                       │                                 │                                 │
                       │                                 │                                 │
                       ▼                                 ▼                                 ▼
              ┌─────────────────┐               ┌─────────────────┐               ┌─────────────────┐
              │   Task Queue    │               │ Image Processing│               │  File Storage   │
              │   Management    │               │   • OpenCV      │               │   • Images      │
              │                 │               │   • PIL/Pillow  │               │   • Results     │
              │                 │               │   • Tesseract   │               │   • Metadata    │
              │                 │               │   • YOLO Models │               │                 │
              └─────────────────┘               └─────────────────┘               └─────────────────┘
                       │                                 │                                 │
                       └─────────────────────────────────┼─────────────────────────────────┘
                                                         │
                                ┌─────────────────────────────────┐
                                │         Data Layer              │
                                │  ┌─────────────┐ ┌─────────────┐│
                                │  │ PostgreSQL  │ │    Redis    ││
                                │  │ (Metadata)  │ │  (Cache)    ││
                                │  └─────────────┘ └─────────────┘│
                                └─────────────────────────────────┘
```

## API Endpoints

### Image Processing
- `POST /api/v1/upload` - Upload image file
- `POST /api/v1/resize` - Resize image
- `POST /api/v1/crop` - Crop image
- `POST /api/v1/filter` - Apply image filters
- `POST /api/v1/enhance` - Enhance image (brightness, contrast, etc.)
- `POST /api/v1/batch` - Batch process multiple images

### AI Services
- `POST /api/v1/ocr` - Extract text from image
- `POST /api/v1/detect-objects` - Detect objects in image
- `POST /api/v1/detect-faces` - Detect faces in image
- `GET /api/v1/image-info` - Get image metadata and analysis

### Management
- `GET /api/v1/tasks/{task_id}` - Get task status
- `GET /health/` - Comprehensive health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

## Quick Start

### Prerequisites
- Python 3.11+
- Docker and Docker Compose
- Make (optional, for convenience commands)

### 1. Clone and Setup
```bash
git clone <repository-url>
cd image-processing-service
cp .env.example .env
# Edit .env with your configuration
```

### 2. Development Setup
```bash
# Using Make (recommended)
make dev-setup

# Or manually
pip install -r requirements.txt
docker-compose up -d
python -m uvicorn app.main:app --reload
```

### 3. Access the Service
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Metrics**: http://localhost:8000/metrics
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## Production Deployment

### Docker Deployment
```bash
# Build and run with Docker Compose
make docker-compose-up

# Or build custom image
make docker-build
docker run -p 8000:8000 --env-file .env image-processing-service:latest
```

### Kubernetes Deployment
```bash
# Deploy to Kubernetes
make k8s-deploy

# Check status
make k8s-status

# View logs
make k8s-logs
```

### Kubernetes Configuration
The service includes comprehensive Kubernetes manifests:
- **Deployment**: API servers and worker pods with auto-scaling
- **Service**: Load balancing and service discovery
- **Ingress**: External access with SSL termination
- **ConfigMap/Secrets**: Configuration management
- **HPA**: Horizontal Pod Autoscaler for dynamic scaling
- **NetworkPolicy**: Network security policies

## Configuration

### Environment Variables
Key configuration options (see `.env.example` for full list):

```bash
# Application
APP_NAME="Image Processing Service"
DEBUG=false
WORKERS=4

# Database
DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/db"
REDIS_URL="redis://host:6379"

# Storage
S3_ENDPOINT_URL="https://s3.amazonaws.com"
S3_BUCKET_NAME="my-bucket"

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_BURST=10

# Image Processing
MAX_IMAGE_SIZE_MB=50
MAX_WORKERS=4
PROCESSING_TIMEOUT=300
```

### Scaling Configuration
```yaml
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Development

### Running Tests
```bash
# All tests
make test

# Unit tests only
make test-unit

# Integration tests
make test-integration

# With coverage
make test-coverage
```

### Code Quality
```bash
# Linting and formatting
make lint
make format

# Type checking
make type-check

# Security checks
make security-check

# All quality checks
make full-check
```

### Adding New Features
1. **Image Processing**: Add new filters/operations in `app/services/image_processor.py`
2. **AI Models**: Extend `app/services/object_detection.py` or `app/services/ocr_service.py`
3. **API Endpoints**: Add routes in `app/api/routes/`
4. **Workers**: Extend task processing in `app/workers/task_processor.py`

## Performance Tuning

### Scaling Workers
```bash
# Scale workers in Kubernetes
kubectl scale deployment image-processing-worker --replicas=10

# Scale API servers
kubectl scale deployment image-processing-app --replicas=5
```

### Resource Limits
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### Caching Strategy
- **Redis**: Rate limiting, session data, temporary results
- **CDN**: Static assets and processed images
- **Application**: In-memory caching for model weights

## Monitoring

### Prometheus Metrics
Key metrics exposed:
- `http_requests_total` - HTTP request counter
- `image_processing_duration_seconds` - Processing time histogram
- `tasks_queued_total` - Queue depth gauge
- `ocr_confidence_score` - OCR confidence histogram
- `objects_detected_total` - Object detection counter

### Grafana Dashboards
Pre-configured dashboards available in `monitoring/grafana/`:
- Application Performance
- System Resources
- Queue Metrics
- Error Rates

### Log Analysis
Structured JSON logs with correlation IDs:
```json
{
  "timestamp": "2023-01-01T12:00:00Z",
  "level": "INFO",
  "correlation_id": "abc-123",
  "service": "image-processing",
  "message": "Image processed successfully",
  "task_id": "task-456",
  "processing_time": 1.23
}
```

## Security

### API Security
- **Rate Limiting**: Per-user/API key limits
- **Input Validation**: Comprehensive request validation
- **File Type Validation**: Strict image format checking
- **Size Limits**: Configurable file size limits

### Infrastructure Security
- **Network Policies**: Kubernetes network isolation
- **Non-root Containers**: Security-hardened container images
- **Secret Management**: Kubernetes secrets for sensitive data
- **TLS/SSL**: End-to-end encryption

### Dependency Security
```bash
# Security scanning
make security-check

# Dependency updates
pip-audit
safety check
```

## Troubleshooting

### Common Issues

**Service Won't Start**
```bash
# Check logs
make logs

# Health check
make health-check

# Database connectivity
make db-migrate
```

**High Memory Usage**
```bash
# Monitor resources
make monitor-memory

# Check worker count
kubectl get pods -n image-processing

# Scale down if needed
kubectl scale deployment image-processing-worker --replicas=3
```

**Queue Backlog**
```bash
# Check queue status
make queue-status

# Clear queue if needed
make clear-queue

# Scale workers
make k8s-scale-workers REPLICAS=10
```

### Performance Issues
1. **CPU Bound**: Scale worker replicas
2. **Memory Bound**: Increase worker memory limits
3. **I/O Bound**: Optimize storage configuration
4. **Network Bound**: Implement CDN for static assets

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make changes and add tests
4. Run quality checks: `make full-check`
5. Commit changes: `git commit -am 'Add new feature'`
6. Push to branch: `git push origin feature/new-feature`
7. Create Pull Request

### Development Workflow
```bash
# Setup development environment
make setup-dev

# Run in development mode
make dev

# Run tests continuously
pytest-watch

# Check code quality before commit
make pre-commit
```

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: /docs endpoint when running
- **Health Status**: /health endpoint
- **Metrics**: /metrics endpoint for monitoring
- **Logs**: Structured logging with correlation IDs

For issues and feature requests, please use the GitHub issue tracker.