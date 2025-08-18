"""Test configuration and fixtures."""
import asyncio
import io
import pytest
from unittest.mock import AsyncMock, MagicMock
from PIL import Image
import numpy as np

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def sample_image_data():
    """Create sample image data for testing."""
    # Create a simple RGB image
    image = Image.new('RGB', (100, 100), color='red')
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG')
    return img_byte_arr.getvalue()


@pytest.fixture
def sample_large_image_data():
    """Create large image data for testing size limits."""
    # Create a larger image
    image = Image.new('RGB', (2000, 2000), color='blue')
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG', quality=95)
    return img_byte_arr.getvalue()


@pytest.fixture
def sample_png_image_data():
    """Create sample PNG image data."""
    image = Image.new('RGBA', (150, 150), color=(255, 0, 0, 128))
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()


@pytest.fixture
def mock_storage_service():
    """Mock storage service."""
    storage_mock = AsyncMock()
    storage_mock.upload_file.return_value = "http://example.com/image.jpg"
    storage_mock.download_file.return_value = b"fake_image_data"
    storage_mock.delete_file.return_value = True
    storage_mock.file_exists.return_value = True
    storage_mock.generate_file_key.return_value = "test/key.jpg"
    return storage_mock


@pytest.fixture
def mock_message_queue():
    """Mock message queue service."""
    queue_mock = AsyncMock()
    queue_mock.publish_task = AsyncMock()
    queue_mock.publish_result = AsyncMock()
    queue_mock.connect = AsyncMock()
    queue_mock.disconnect = AsyncMock()
    return queue_mock


@pytest.fixture
def mock_image_processor():
    """Mock image processor service."""
    processor_mock = AsyncMock()
    processor_mock.validate_image.return_value = (True, "Valid image")
    processor_mock.resize_image.return_value = b"resized_image_data"
    processor_mock.crop_image.return_value = b"cropped_image_data"
    processor_mock.apply_filter.return_value = b"filtered_image_data"
    processor_mock.enhance_image.return_value = b"enhanced_image_data"
    processor_mock.get_image_info.return_value = {
        "format": "JPEG",
        "size": (100, 100),
        "mode": "RGB"
    }
    return processor_mock


@pytest.fixture
def mock_ocr_service():
    """Mock OCR service."""
    from app.models.schemas import OCRResult, BoundingBox
    
    ocr_mock = AsyncMock()
    ocr_mock.extract_text_tesseract.return_value = [
        OCRResult(
            text="Sample text",
            confidence=0.95,
            bbox=BoundingBox(x1=10, y1=10, x2=90, y2=30, confidence=0.95)
        )
    ]
    ocr_mock.extract_text_easyocr.return_value = [
        OCRResult(
            text="Sample text",
            confidence=0.92,
            bbox=BoundingBox(x1=10, y1=10, x2=90, y2=30, confidence=0.92)
        )
    ]
    return ocr_mock


@pytest.fixture
def mock_object_detection_service():
    """Mock object detection service."""
    from app.models.schemas import DetectedObject, BoundingBox
    
    detection_mock = AsyncMock()
    detection_mock.detect_objects_yolo.return_value = [
        DetectedObject(
            class_name="person",
            confidence=0.85,
            bbox=BoundingBox(x1=20, y1=20, x2=80, y2=90, confidence=0.85)
        ),
        DetectedObject(
            class_name="car",
            confidence=0.75,
            bbox=BoundingBox(x1=100, y1=50, x2=180, y2=120, confidence=0.75)
        )
    ]
    detection_mock.detect_faces.return_value = [
        DetectedObject(
            class_name="face",
            confidence=1.0,
            bbox=BoundingBox(x1=30, y1=30, x2=70, y2=70, confidence=1.0)
        )
    ]
    return detection_mock


@pytest.fixture
def mock_circuit_breaker():
    """Mock circuit breaker."""
    breaker_mock = MagicMock()
    breaker_mock.call = AsyncMock(side_effect=lambda func, *args, **kwargs: func(*args, **kwargs))
    breaker_mock.state = "closed"
    breaker_mock.failure_count = 0
    return breaker_mock


@pytest.fixture
def mock_rate_limiter():
    """Mock rate limiter."""
    limiter_mock = AsyncMock()
    limiter_mock.is_allowed.return_value = (True, {
        "allowed": True,
        "current_requests": 1,
        "limit": 60,
        "window": 60,
        "reset_time": 1234567890
    })
    return limiter_mock


@pytest.fixture
def mock_metrics_collector():
    """Mock metrics collector."""
    metrics_mock = MagicMock()
    metrics_mock.record_request = MagicMock()
    metrics_mock.record_image_processing = MagicMock()
    metrics_mock.record_task_processing = MagicMock()
    metrics_mock.record_ocr_result = MagicMock()
    metrics_mock.record_object_detection = MagicMock()
    metrics_mock.record_storage_operation = MagicMock()
    return metrics_mock


@pytest.fixture
def mock_health_service():
    """Mock health service."""
    health_mock = AsyncMock()
    health_mock.perform_comprehensive_health_check.return_value = {
        "status": "healthy",
        "timestamp": "2023-01-01T00:00:00",
        "response_time_ms": 50.0,
        "service": {
            "name": "Image Processing Service",
            "version": "1.0.0",
            "uptime_seconds": 3600.0
        },
        "dependencies": {
            "database": {"status": "healthy"},
            "redis": {"status": "healthy"},
            "storage": {"status": "healthy"},
            "message_queue": {"status": "healthy"},
            "system_resources": {"status": "healthy"}
        }
    }
    health_mock.check_liveness.return_value = {
        "status": "alive",
        "timestamp": "2023-01-01T00:00:00"
    }
    health_mock.check_readiness.return_value = {
        "status": "ready",
        "timestamp": "2023-01-01T00:00:00"
    }
    return health_mock