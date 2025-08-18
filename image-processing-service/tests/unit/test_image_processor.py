"""Unit tests for image processor service."""
import pytest
import numpy as np
from PIL import Image
import io

from app.services.image_processor import ImageProcessor, ImageProcessingError
from app.models.schemas import FilterType, ImageFormat


class TestImageProcessor:
    """Test cases for ImageProcessor."""
    
    @pytest.fixture
    def processor(self):
        """Create image processor instance."""
        return ImageProcessor()
    
    @pytest.mark.asyncio
    async def test_validate_image_valid_jpeg(self, processor, sample_image_data):
        """Test validation of valid JPEG image."""
        is_valid, message = await processor.validate_image(sample_image_data)
        assert is_valid is True
        assert "Valid image" in message
    
    @pytest.mark.asyncio
    async def test_validate_image_invalid_data(self, processor):
        """Test validation of invalid image data."""
        invalid_data = b"not an image"
        is_valid, message = await processor.validate_image(invalid_data)
        assert is_valid is False
        assert "Invalid image data" in message
    
    @pytest.mark.asyncio
    async def test_validate_image_size_limit(self, processor, monkeypatch):
        """Test validation of oversized image."""
        # Mock smaller size limit
        monkeypatch.setattr(processor, "max_size", 100)
        
        # Create image larger than limit
        large_image_data = b"x" * 200
        is_valid, message = await processor.validate_image(large_image_data)
        assert is_valid is False
        assert "exceeds maximum limit" in message
    
    @pytest.mark.asyncio
    async def test_resize_image_maintain_aspect_ratio(self, processor, sample_image_data):
        """Test image resizing with aspect ratio maintenance."""
        resized_data = await processor.resize_image(
            sample_image_data,
            width=200,
            height=150,
            maintain_aspect_ratio=True,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(resized_data, bytes)
        assert len(resized_data) > 0
        
        # Verify the resized image
        resized_image = Image.open(io.BytesIO(resized_data))
        assert resized_image.format == "JPEG"
        assert resized_image.size[0] <= 200
        assert resized_image.size[1] <= 150
    
    @pytest.mark.asyncio
    async def test_resize_image_exact_dimensions(self, processor, sample_image_data):
        """Test image resizing without aspect ratio maintenance."""
        resized_data = await processor.resize_image(
            sample_image_data,
            width=300,
            height=200,
            maintain_aspect_ratio=False,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(resized_data, bytes)
        
        # Verify exact dimensions
        resized_image = Image.open(io.BytesIO(resized_data))
        assert resized_image.size == (300, 200)
    
    @pytest.mark.asyncio
    async def test_crop_image_valid_area(self, processor, sample_image_data):
        """Test image cropping with valid area."""
        cropped_data = await processor.crop_image(
            sample_image_data,
            x=10,
            y=10,
            width=50,
            height=50,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(cropped_data, bytes)
        
        # Verify cropped dimensions
        cropped_image = Image.open(io.BytesIO(cropped_data))
        assert cropped_image.size == (50, 50)
    
    @pytest.mark.asyncio
    async def test_crop_image_invalid_area(self, processor, sample_image_data):
        """Test image cropping with invalid area."""
        with pytest.raises(ImageProcessingError, match="exceed image boundaries"):
            await processor.crop_image(
                sample_image_data,
                x=90,
                y=90,
                width=50,
                height=50
            )
    
    @pytest.mark.asyncio
    async def test_apply_filter_blur(self, processor, sample_image_data):
        """Test applying blur filter."""
        filtered_data = await processor.apply_filter(
            sample_image_data,
            filter_type=FilterType.BLUR,
            intensity=2.0,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(filtered_data, bytes)
        assert len(filtered_data) > 0
    
    @pytest.mark.asyncio
    async def test_apply_filter_edge_detection(self, processor, sample_image_data):
        """Test applying edge detection filter."""
        filtered_data = await processor.apply_filter(
            sample_image_data,
            filter_type=FilterType.EDGE_DETECTION,
            intensity=1.5,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(filtered_data, bytes)
        assert len(filtered_data) > 0
    
    @pytest.mark.asyncio
    async def test_apply_filter_invalid_type(self, processor, sample_image_data):
        """Test applying invalid filter type."""
        with pytest.raises(ImageProcessingError, match="Unsupported filter type"):
            # This would need to be mocked to test invalid enum
            await processor.apply_filter(
                sample_image_data,
                filter_type="invalid_filter",
                intensity=1.0
            )
    
    @pytest.mark.asyncio
    async def test_get_image_info(self, processor, sample_image_data):
        """Test getting image information."""
        info = await processor.get_image_info(sample_image_data)
        
        assert isinstance(info, dict)
        assert "format" in info
        assert "size" in info
        assert "width" in info
        assert "height" in info
        assert "file_size" in info
        assert info["format"] == "JPEG"
        assert info["width"] == 100
        assert info["height"] == 100
    
    @pytest.mark.asyncio
    async def test_enhance_image_all_parameters(self, processor, sample_image_data):
        """Test image enhancement with all parameters."""
        enhanced_data = await processor.enhance_image(
            sample_image_data,
            brightness=1.2,
            contrast=1.1,
            saturation=1.3,
            sharpness=1.4,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(enhanced_data, bytes)
        assert len(enhanced_data) > 0
    
    @pytest.mark.asyncio
    async def test_enhance_image_png_to_jpeg_conversion(self, processor, sample_png_image_data):
        """Test PNG to JPEG conversion during enhancement."""
        enhanced_data = await processor.enhance_image(
            sample_png_image_data,
            brightness=1.1,
            output_format=ImageFormat.JPEG
        )
        
        assert isinstance(enhanced_data, bytes)
        
        # Verify conversion to JPEG
        enhanced_image = Image.open(io.BytesIO(enhanced_data))
        assert enhanced_image.format == "JPEG"
    
    @pytest.mark.asyncio
    async def test_resize_image_with_invalid_data(self, processor):
        """Test resize with invalid image data."""
        with pytest.raises(ImageProcessingError):
            await processor.resize_image(
                b"invalid image data",
                width=100,
                height=100
            )
    
    @pytest.mark.asyncio
    async def test_image_format_conversion(self, processor, sample_image_data):
        """Test image format conversion during processing."""
        # Convert JPEG to PNG
        resized_data = await processor.resize_image(
            sample_image_data,
            width=100,
            height=100,
            output_format=ImageFormat.PNG
        )
        
        resized_image = Image.open(io.BytesIO(resized_data))
        assert resized_image.format == "PNG"