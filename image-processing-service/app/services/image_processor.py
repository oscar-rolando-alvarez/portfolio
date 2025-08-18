"""Image processing service with OpenCV and PIL capabilities."""
import asyncio
import io
from typing import Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from skimage import filters, morphology, feature

from app.core.config import settings
from app.core.logging import get_logger
from app.models.schemas import FilterType, ImageFormat

logger = get_logger(__name__)


class ImageProcessingError(Exception):
    """Image processing specific error."""
    pass


class ImageProcessor:
    """Advanced image processing service."""
    
    def __init__(self):
        self.max_size = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
        self.supported_formats = settings.SUPPORTED_FORMATS
    
    async def validate_image(self, image_data: bytes) -> Tuple[bool, str]:
        """Validate image data and format."""
        try:
            # Check size
            if len(image_data) > self.max_size:
                return False, f"Image size exceeds maximum limit of {settings.MAX_IMAGE_SIZE_MB}MB"
            
            # Try to open with PIL
            image = Image.open(io.BytesIO(image_data))
            
            # Check format
            format_lower = image.format.lower() if image.format else ""
            if format_lower not in self.supported_formats:
                return False, f"Unsupported format: {image.format}. Supported: {self.supported_formats}"
            
            # Check image dimensions
            width, height = image.size
            if width > 10000 or height > 10000:
                return False, "Image dimensions too large (max 10000x10000)"
            
            return True, "Valid image"
            
        except Exception as e:
            return False, f"Invalid image data: {str(e)}"
    
    async def resize_image(
        self, 
        image_data: bytes, 
        width: int, 
        height: int,
        maintain_aspect_ratio: bool = True,
        output_format: ImageFormat = ImageFormat.JPEG,
        quality: int = 85
    ) -> bytes:
        """Resize image with optional aspect ratio maintenance."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            if maintain_aspect_ratio:
                # Calculate new dimensions maintaining aspect ratio
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
            
            # Resize image
            resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Convert to output format if needed
            if output_format == ImageFormat.JPEG and resized_image.mode in ('RGBA', 'LA', 'P'):
                # Convert to RGB for JPEG
                rgb_image = Image.new('RGB', resized_image.size, (255, 255, 255))
                rgb_image.paste(resized_image, mask=resized_image.split()[-1] if resized_image.mode == 'RGBA' else None)
                resized_image = rgb_image
            
            # Save to bytes
            output_buffer = io.BytesIO()
            save_format = output_format.value.upper()
            if save_format == 'JPEG':
                resized_image.save(output_buffer, format=save_format, quality=quality, optimize=True)
            else:
                resized_image.save(output_buffer, format=save_format)
            
            logger.info(f"Image resized successfully", extra={
                "original_size": f"{image.size[0]}x{image.size[1]}",
                "new_size": f"{new_width}x{new_height}",
                "output_format": output_format.value
            })
            
            return output_buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Image resize failed: {e}")
            raise ImageProcessingError(f"Resize failed: {str(e)}")
    
    async def crop_image(
        self,
        image_data: bytes,
        x: int,
        y: int,
        width: int,
        height: int,
        output_format: ImageFormat = ImageFormat.JPEG,
        quality: int = 85
    ) -> bytes:
        """Crop image to specified dimensions."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # Validate crop dimensions
            img_width, img_height = image.size
            if x + width > img_width or y + height > img_height:
                raise ImageProcessingError("Crop dimensions exceed image boundaries")
            
            # Crop image
            cropped_image = image.crop((x, y, x + width, y + height))
            
            # Convert format if needed
            if output_format == ImageFormat.JPEG and cropped_image.mode in ('RGBA', 'LA', 'P'):
                rgb_image = Image.new('RGB', cropped_image.size, (255, 255, 255))
                rgb_image.paste(cropped_image, mask=cropped_image.split()[-1] if cropped_image.mode == 'RGBA' else None)
                cropped_image = rgb_image
            
            # Save to bytes
            output_buffer = io.BytesIO()
            save_format = output_format.value.upper()
            if save_format == 'JPEG':
                cropped_image.save(output_buffer, format=save_format, quality=quality, optimize=True)
            else:
                cropped_image.save(output_buffer, format=save_format)
            
            logger.info(f"Image cropped successfully", extra={
                "crop_area": f"{x},{y},{width}x{height}",
                "output_format": output_format.value
            })
            
            return output_buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Image crop failed: {e}")
            raise ImageProcessingError(f"Crop failed: {str(e)}")
    
    async def apply_filter(
        self,
        image_data: bytes,
        filter_type: FilterType,
        intensity: float = 1.0,
        output_format: ImageFormat = ImageFormat.JPEG,
        quality: int = 85
    ) -> bytes:
        """Apply various filters to image."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # Apply filter based on type
            if filter_type == FilterType.BLUR:
                filtered_image = image.filter(ImageFilter.GaussianBlur(radius=intensity))
            
            elif filter_type == FilterType.SHARPEN:
                enhancer = ImageEnhance.Sharpness(image)
                filtered_image = enhancer.enhance(1.0 + intensity)
            
            elif filter_type == FilterType.EDGE_DETECTION:
                # Convert to OpenCV format for edge detection
                cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
                
                # Apply Canny edge detection
                edges = cv2.Canny(gray, int(50 * intensity), int(150 * intensity))
                
                # Convert back to PIL
                filtered_image = Image.fromarray(edges).convert('RGB')
            
            elif filter_type == FilterType.GAUSSIAN_BLUR:
                filtered_image = image.filter(ImageFilter.GaussianBlur(radius=intensity * 2))
            
            elif filter_type == FilterType.MEDIAN_FILTER:
                # Use OpenCV for median filter
                cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                kernel_size = max(3, int(intensity * 5))
                if kernel_size % 2 == 0:
                    kernel_size += 1
                
                filtered_cv = cv2.medianBlur(cv_image, kernel_size)
                filtered_image = Image.fromarray(cv2.cvtColor(filtered_cv, cv2.COLOR_BGR2RGB))
            
            elif filter_type == FilterType.EMBOSS:
                filtered_image = image.filter(ImageFilter.EMBOSS)
                if intensity != 1.0:
                    # Blend with original
                    filtered_image = Image.blend(image, filtered_image, intensity)
            
            elif filter_type == FilterType.CONTOUR:
                filtered_image = image.filter(ImageFilter.CONTOUR)
                if intensity != 1.0:
                    filtered_image = Image.blend(image, filtered_image, intensity)
            
            else:
                raise ImageProcessingError(f"Unsupported filter type: {filter_type}")
            
            # Convert format if needed
            if output_format == ImageFormat.JPEG and filtered_image.mode in ('RGBA', 'LA', 'P'):
                rgb_image = Image.new('RGB', filtered_image.size, (255, 255, 255))
                rgb_image.paste(filtered_image, mask=filtered_image.split()[-1] if filtered_image.mode == 'RGBA' else None)
                filtered_image = rgb_image
            
            # Save to bytes
            output_buffer = io.BytesIO()
            save_format = output_format.value.upper()
            if save_format == 'JPEG':
                filtered_image.save(output_buffer, format=save_format, quality=quality, optimize=True)
            else:
                filtered_image.save(output_buffer, format=save_format)
            
            logger.info(f"Filter applied successfully", extra={
                "filter_type": filter_type.value,
                "intensity": intensity,
                "output_format": output_format.value
            })
            
            return output_buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Filter application failed: {e}")
            raise ImageProcessingError(f"Filter failed: {str(e)}")
    
    async def get_image_info(self, image_data: bytes) -> Dict:
        """Get comprehensive image information."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # Basic info
            info = {
                "format": image.format,
                "mode": image.mode,
                "size": image.size,
                "width": image.size[0],
                "height": image.size[1],
                "has_transparency": image.mode in ('RGBA', 'LA') or 'transparency' in image.info,
                "file_size": len(image_data)
            }
            
            # EXIF data if available
            if hasattr(image, '_getexif') and image._getexif():
                info["exif"] = dict(image._getexif())
            
            # Color analysis using OpenCV
            cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            # Calculate histogram
            hist_r = cv2.calcHist([cv_image], [2], None, [256], [0, 256])
            hist_g = cv2.calcHist([cv_image], [1], None, [256], [0, 256])
            hist_b = cv2.calcHist([cv_image], [0], None, [256], [0, 256])
            
            info["color_analysis"] = {
                "mean_rgb": [float(np.mean(cv_image[:, :, 2])), 
                           float(np.mean(cv_image[:, :, 1])), 
                           float(np.mean(cv_image[:, :, 0]))],
                "std_rgb": [float(np.std(cv_image[:, :, 2])), 
                          float(np.std(cv_image[:, :, 1])), 
                          float(np.std(cv_image[:, :, 0]))]
            }
            
            return info
            
        except Exception as e:
            logger.error(f"Failed to get image info: {e}")
            raise ImageProcessingError(f"Info extraction failed: {str(e)}")
    
    async def enhance_image(
        self,
        image_data: bytes,
        brightness: float = 1.0,
        contrast: float = 1.0,
        saturation: float = 1.0,
        sharpness: float = 1.0,
        output_format: ImageFormat = ImageFormat.JPEG,
        quality: int = 85
    ) -> bytes:
        """Enhance image with multiple adjustments."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # Apply enhancements in sequence
            if brightness != 1.0:
                enhancer = ImageEnhance.Brightness(image)
                image = enhancer.enhance(brightness)
            
            if contrast != 1.0:
                enhancer = ImageEnhance.Contrast(image)
                image = enhancer.enhance(contrast)
            
            if saturation != 1.0:
                enhancer = ImageEnhance.Color(image)
                image = enhancer.enhance(saturation)
            
            if sharpness != 1.0:
                enhancer = ImageEnhance.Sharpness(image)
                image = enhancer.enhance(sharpness)
            
            # Convert format if needed
            if output_format == ImageFormat.JPEG and image.mode in ('RGBA', 'LA', 'P'):
                rgb_image = Image.new('RGB', image.size, (255, 255, 255))
                rgb_image.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                image = rgb_image
            
            # Save to bytes
            output_buffer = io.BytesIO()
            save_format = output_format.value.upper()
            if save_format == 'JPEG':
                image.save(output_buffer, format=save_format, quality=quality, optimize=True)
            else:
                image.save(output_buffer, format=save_format)
            
            logger.info(f"Image enhanced successfully", extra={
                "brightness": brightness,
                "contrast": contrast,
                "saturation": saturation,
                "sharpness": sharpness
            })
            
            return output_buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Image enhancement failed: {e}")
            raise ImageProcessingError(f"Enhancement failed: {str(e)}")


# Global image processor instance
image_processor = ImageProcessor()