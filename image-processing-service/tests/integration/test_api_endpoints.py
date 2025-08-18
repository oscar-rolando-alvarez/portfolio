"""Integration tests for API endpoints."""
import pytest
import json
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app


class TestImageProcessingEndpoints:
    """Test cases for image processing API endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    def test_root_endpoint(self, client):
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        
        data = response.json()
        assert data["service"] == "Image Processing Service"
        assert data["version"] == "1.0.0"
        assert data["status"] == "running"
    
    @patch('app.services.image_processor.image_processor')
    @patch('app.services.storage.storage_service')
    @patch('app.services.metrics.metrics_collector')
    def test_upload_image_success(self, mock_metrics, mock_storage, mock_processor, client):
        """Test successful image upload."""
        # Mock dependencies
        mock_processor.validate_image.return_value = (True, "Valid image")
        mock_storage.upload_file.return_value = "http://example.com/image.jpg"
        mock_storage.generate_file_key.return_value = "uploads/test.jpg"
        
        # Create test file
        test_file = ("test.jpg", b"fake image data", "image/jpeg")
        
        response = client.post(
            "/api/v1/upload",
            files={"file": test_file},
            data={"process_immediately": "false"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "completed"
        assert "task_id" in data
        assert data["result_url"] == "http://example.com/image.jpg"
    
    @patch('app.services.image_processor.image_processor')
    def test_upload_image_invalid_file(self, mock_processor, client):
        """Test upload with invalid image file."""
        mock_processor.validate_image.return_value = (False, "Invalid image format")
        
        test_file = ("test.txt", b"not an image", "text/plain")
        
        response = client.post(
            "/api/v1/upload",
            files={"file": test_file}
        )
        
        assert response.status_code == 400
        assert "File must be an image" in response.json()["detail"]
    
    @patch('app.services.message_queue.message_queue')
    def test_resize_image_endpoint(self, mock_queue, client):
        """Test image resize endpoint."""
        mock_queue.publish_task = AsyncMock()
        
        request_data = {
            "image_url": "http://example.com/image.jpg",
            "width": 300,
            "height": 200,
            "maintain_aspect_ratio": True,
            "output_format": "jpeg",
            "quality": 85
        }
        
        response = client.post("/api/v1/resize", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "pending"
        assert "task_id" in data
    
    @patch('app.services.message_queue.message_queue')
    def test_crop_image_endpoint(self, mock_queue, client):
        """Test image crop endpoint."""
        mock_queue.publish_task = AsyncMock()
        
        request_data = {
            "image_url": "http://example.com/image.jpg",
            "x": 10,
            "y": 10,
            "width": 100,
            "height": 100,
            "output_format": "png"
        }
        
        response = client.post("/api/v1/crop", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "pending"
    
    @patch('app.services.message_queue.message_queue')
    def test_apply_filter_endpoint(self, mock_queue, client):
        """Test apply filter endpoint."""
        mock_queue.publish_task = AsyncMock()
        
        request_data = {
            "image_url": "http://example.com/image.jpg",
            "filter_type": "blur",
            "intensity": 2.0,
            "output_format": "jpeg"
        }
        
        response = client.post("/api/v1/filter", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "pending"
    
    @patch('app.services.ocr_service.ocr_service')
    @patch('app.services.storage.storage_service')
    @patch('app.services.metrics.metrics_collector')
    def test_ocr_endpoint_success(self, mock_metrics, mock_storage, mock_ocr, client):
        """Test OCR endpoint with successful text extraction."""
        from app.models.schemas import OCRResult, BoundingBox
        
        # Mock dependencies
        mock_storage.upload_from_url.return_value = (
            "http://storage.url", 
            {"key": "test.jpg", "size": 1024}
        )
        mock_storage.download_file.return_value = b"fake image data"
        mock_ocr.extract_text_tesseract.return_value = [
            OCRResult(
                text="Sample text",
                confidence=0.95,
                bbox=BoundingBox(x1=10, y1=10, x2=90, y2=30, confidence=0.95)
            )
        ]
        
        request_data = {
            "image_url": "http://example.com/image.jpg",
            "languages": ["eng"],
            "detect_orientation": True,
            "extract_confidence": True
        }
        
        response = client.post("/api/v1/ocr", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["results"]) == 1
        assert data["results"][0]["text"] == "Sample text"
        assert data["results"][0]["confidence"] == 0.95
    
    @patch('app.services.object_detection.object_detection_service')
    @patch('app.services.storage.storage_service')
    @patch('app.services.metrics.metrics_collector')
    def test_object_detection_endpoint(self, mock_metrics, mock_storage, mock_detection, client):
        """Test object detection endpoint."""
        from app.models.schemas import DetectedObject, BoundingBox
        
        # Mock dependencies
        mock_storage.upload_from_url.return_value = (
            "http://storage.url",
            {"key": "test.jpg", "size": 1024}
        )
        mock_storage.download_file.return_value = b"fake image data"
        mock_detection.detect_objects_yolo.return_value = [
            DetectedObject(
                class_name="person",
                confidence=0.85,
                bbox=BoundingBox(x1=20, y1=20, x2=80, y2=90, confidence=0.85)
            )
        ]
        
        request_data = {
            "image_url": "http://example.com/image.jpg",
            "confidence_threshold": 0.5,
            "max_detections": 10
        }
        
        response = client.post("/api/v1/detect-objects", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["objects"]) == 1
        assert data["objects"][0]["class_name"] == "person"
        assert data["objects"][0]["confidence"] == 0.85
    
    @patch('app.services.message_queue.message_queue')
    def test_batch_processing_endpoint(self, mock_queue, client):
        """Test batch processing endpoint."""
        mock_queue.publish_task = AsyncMock()
        
        request_data = {
            "image_urls": [
                "http://example.com/image1.jpg",
                "http://example.com/image2.jpg"
            ],
            "operations": [
                {"type": "resize", "width": 300, "height": 200},
                {"type": "filter", "filter_type": "blur", "intensity": 1.5}
            ]
        }
        
        response = client.post("/api/v1/batch", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "batch_id" in data
        assert len(data["task_ids"]) == 4  # 2 images * 2 operations
        assert data["total_tasks"] == 4
    
    def test_get_task_status_endpoint(self, client):
        """Test get task status endpoint."""
        task_id = "test-task-123"
        
        response = client.get(f"/api/v1/tasks/{task_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["task_id"] == task_id
        assert "status" in data
        assert "created_at" in data
    
    @patch('app.services.image_processor.image_processor')
    @patch('app.services.storage.storage_service')
    def test_image_info_endpoint(self, mock_storage, mock_processor, client):
        """Test image info endpoint."""
        # Mock dependencies
        mock_storage.upload_from_url.return_value = (
            "http://storage.url",
            {"key": "test.jpg", "size": 1024}
        )
        mock_storage.download_file.return_value = b"fake image data"
        mock_processor.get_image_info.return_value = {
            "format": "JPEG",
            "size": (800, 600),
            "width": 800,
            "height": 600,
            "file_size": 1024
        }
        
        response = client.get("/api/v1/image-info?image_url=http://example.com/image.jpg")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["image_info"]["format"] == "JPEG"
        assert data["image_info"]["width"] == 800
        assert data["image_info"]["height"] == 600


class TestHealthEndpoints:
    """Test cases for health check endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    @patch('app.services.health.health_service')
    def test_health_check_healthy(self, mock_health, client):
        """Test health check when service is healthy."""
        mock_health.perform_comprehensive_health_check.return_value = {
            "status": "healthy",
            "timestamp": "2023-01-01T00:00:00",
            "dependencies": {
                "database": {"status": "healthy"},
                "redis": {"status": "healthy"}
            }
        }
        
        response = client.get("/health/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    @patch('app.services.health.health_service')
    def test_health_check_unhealthy(self, mock_health, client):
        """Test health check when service is unhealthy."""
        mock_health.perform_comprehensive_health_check.return_value = {
            "status": "unhealthy",
            "timestamp": "2023-01-01T00:00:00",
            "dependencies": {
                "database": {"status": "unhealthy"},
                "redis": {"status": "healthy"}
            }
        }
        
        response = client.get("/health/")
        
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
    
    @patch('app.services.health.health_service')
    def test_liveness_probe(self, mock_health, client):
        """Test liveness probe endpoint."""
        mock_health.check_liveness.return_value = {
            "status": "alive",
            "timestamp": "2023-01-01T00:00:00"
        }
        
        response = client.get("/health/live")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"
    
    @patch('app.services.health.health_service')
    def test_readiness_probe_ready(self, mock_health, client):
        """Test readiness probe when service is ready."""
        mock_health.check_readiness.return_value = {
            "status": "ready",
            "timestamp": "2023-01-01T00:00:00"
        }
        
        response = client.get("/health/ready")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
    
    @patch('app.services.health.health_service')
    def test_readiness_probe_not_ready(self, mock_health, client):
        """Test readiness probe when service is not ready."""
        mock_health.check_readiness.return_value = {
            "status": "not_ready",
            "timestamp": "2023-01-01T00:00:00"
        }
        
        response = client.get("/health/ready")
        
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"


class TestMetricsEndpoints:
    """Test cases for metrics endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    @patch('app.services.metrics.metrics_collector')
    def test_metrics_endpoint_enabled(self, mock_metrics, client):
        """Test metrics endpoint when metrics are enabled."""
        mock_metrics.get_metrics.return_value = "# HELP test_metric Test metric\ntest_metric 1.0\n"
        mock_metrics.get_content_type.return_value = "text/plain; charset=utf-8"
        
        with patch('app.core.config.settings') as mock_settings:
            mock_settings.ENABLE_METRICS = True
            
            response = client.get("/metrics/metrics")
            
            assert response.status_code == 200
            assert "test_metric 1.0" in response.text
    
    def test_metrics_endpoint_disabled(self, client):
        """Test metrics endpoint when metrics are disabled."""
        with patch('app.core.config.settings') as mock_settings:
            mock_settings.ENABLE_METRICS = False
            
            response = client.get("/metrics/metrics")
            
            assert response.status_code == 404