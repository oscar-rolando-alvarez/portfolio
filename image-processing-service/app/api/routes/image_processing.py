"""Image processing API endpoints."""
import asyncio
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import JSONResponse

from app.core.logging import get_logger
from app.models.schemas import (
    ImageProcessingRequest, ImageProcessingResponse, ResizeRequest, CropRequest,
    FilterRequest, OCRRequest, OCRResponse, ObjectDetectionRequest, 
    ObjectDetectionResponse, BatchProcessingRequest, BatchProcessingResponse,
    TaskStatus, ProcessingStatus, ErrorResponse
)
from app.services.image_processor import image_processor
from app.services.message_queue import message_queue
from app.services.metrics import metrics_collector
from app.services.ocr_service import ocr_service
from app.services.object_detection import object_detection_service
from app.services.storage import storage_service

logger = get_logger(__name__)
router = APIRouter()


@router.post("/upload", response_model=ImageProcessingResponse)
async def upload_image(
    file: UploadFile = File(...),
    process_immediately: bool = Form(False)
):
    """Upload image and optionally process immediately."""
    try:
        # Validate file
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Read file data
        file_data = await file.read()
        
        # Validate image
        is_valid, message = await image_processor.validate_image(file_data)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=message
            )
        
        # Generate unique key and upload to storage
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        storage_key = storage_service.generate_file_key(file_extension, "uploads")
        
        upload_url = await storage_service.upload_file(
            file_data,
            storage_key,
            file.content_type,
            metadata={
                "original_filename": file.filename,
                "upload_timestamp": time.time(),
                "file_size": len(file_data)
            }
        )
        
        task_id = str(uuid.uuid4())
        
        # Record metrics
        metrics_collector.record_storage_operation("upload", 0, "success")
        
        logger.info(f"Image uploaded successfully", extra={
            "task_id": task_id,
            "filename": file.filename,
            "size": len(file_data),
            "storage_key": storage_key
        })
        
        return ImageProcessingResponse(
            task_id=task_id,
            status=ProcessingStatus.COMPLETED,
            result_url=upload_url,
            message="Image uploaded successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


@router.post("/resize", response_model=ImageProcessingResponse)
async def resize_image(request: ResizeRequest):
    """Resize image asynchronously."""
    try:
        task_id = str(uuid.uuid4())
        
        # Create task data
        task_data = {
            "task_id": task_id,
            "task_type": "resize_image",
            "input_data": request.dict(),
            "created_at": time.time()
        }
        
        # Queue task for processing
        await message_queue.publish_task("resize_image", task_data)
        
        logger.info(f"Resize task queued", extra={
            "task_id": task_id,
            "dimensions": f"{request.width}x{request.height}"
        })
        
        return ImageProcessingResponse(
            task_id=task_id,
            status=ProcessingStatus.PENDING,
            message="Resize task queued for processing"
        )
        
    except Exception as e:
        logger.error(f"Resize request failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resize request failed: {str(e)}"
        )


@router.post("/crop", response_model=ImageProcessingResponse)
async def crop_image(request: CropRequest):
    """Crop image asynchronously."""
    try:
        task_id = str(uuid.uuid4())
        
        # Create task data
        task_data = {
            "task_id": task_id,
            "task_type": "crop_image",
            "input_data": request.dict(),
            "created_at": time.time()
        }
        
        # Queue task for processing
        await message_queue.publish_task("crop_image", task_data)
        
        logger.info(f"Crop task queued", extra={
            "task_id": task_id,
            "crop_area": f"{request.x},{request.y},{request.width}x{request.height}"
        })
        
        return ImageProcessingResponse(
            task_id=task_id,
            status=ProcessingStatus.PENDING,
            message="Crop task queued for processing"
        )
        
    except Exception as e:
        logger.error(f"Crop request failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Crop request failed: {str(e)}"
        )


@router.post("/filter", response_model=ImageProcessingResponse)
async def apply_filter(request: FilterRequest):
    """Apply filter to image asynchronously."""
    try:
        task_id = str(uuid.uuid4())
        
        # Create task data
        task_data = {
            "task_id": task_id,
            "task_type": "apply_filter",
            "input_data": request.dict(),
            "created_at": time.time()
        }
        
        # Queue task for processing
        await message_queue.publish_task("apply_filter", task_data)
        
        logger.info(f"Filter task queued", extra={
            "task_id": task_id,
            "filter_type": request.filter_type.value,
            "intensity": request.intensity
        })
        
        return ImageProcessingResponse(
            task_id=task_id,
            status=ProcessingStatus.PENDING,
            message="Filter task queued for processing"
        )
        
    except Exception as e:
        logger.error(f"Filter request failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Filter request failed: {str(e)}"
        )


@router.post("/ocr", response_model=OCRResponse)
async def extract_text(request: OCRRequest):
    """Extract text from image using OCR."""
    try:
        start_time = time.time()
        
        # Download image from URL if provided
        if request.image_url:
            storage_url, file_info = await storage_service.upload_from_url(request.image_url)
            image_data = await storage_service.download_file(file_info['key'])
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="image_url is required"
            )
        
        # Extract text using Tesseract
        ocr_results = await ocr_service.extract_text_tesseract(
            image_data,
            request.languages,
            request.detect_orientation,
            request.extract_confidence
        )
        
        processing_time = time.time() - start_time
        task_id = str(uuid.uuid4())
        
        # Record metrics
        total_text_length = sum(len(result.text) for result in ocr_results)
        avg_confidence = sum(result.confidence or 0 for result in ocr_results) / len(ocr_results) if ocr_results else 0
        
        metrics_collector.record_ocr_result(
            "tesseract", 
            ",".join(request.languages),
            total_text_length,
            avg_confidence
        )
        
        logger.info(f"OCR processing completed", extra={
            "task_id": task_id,
            "processing_time": processing_time,
            "texts_extracted": len(ocr_results)
        })
        
        return OCRResponse(
            task_id=task_id,
            results=ocr_results,
            processing_time=processing_time,
            message="OCR processing completed successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OCR processing failed: {str(e)}"
        )


@router.post("/detect-objects", response_model=ObjectDetectionResponse)
async def detect_objects(request: ObjectDetectionRequest):
    """Detect objects in image."""
    try:
        start_time = time.time()
        
        # Download image from URL if provided
        if request.image_url:
            storage_url, file_info = await storage_service.upload_from_url(request.image_url)
            image_data = await storage_service.download_file(file_info['key'])
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="image_url is required"
            )
        
        # Detect objects using YOLO
        detected_objects = await object_detection_service.detect_objects_yolo(
            image_data,
            request.confidence_threshold,
            request.max_detections,
            request.classes_filter
        )
        
        processing_time = time.time() - start_time
        task_id = str(uuid.uuid4())
        
        # Record metrics
        detection_data = [
            {"class_name": obj.class_name, "confidence": obj.confidence}
            for obj in detected_objects
        ]
        metrics_collector.record_object_detection("yolo", detection_data)
        
        logger.info(f"Object detection completed", extra={
            "task_id": task_id,
            "processing_time": processing_time,
            "objects_detected": len(detected_objects)
        })
        
        return ObjectDetectionResponse(
            task_id=task_id,
            objects=detected_objects,
            processing_time=processing_time,
            image_url=request.image_url,
            message="Object detection completed successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Object detection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Object detection failed: {str(e)}"
        )


@router.post("/batch", response_model=BatchProcessingResponse)
async def batch_process(request: BatchProcessingRequest):
    """Process multiple images in batch."""
    try:
        batch_id = str(uuid.uuid4())
        task_ids = []
        
        for image_url in request.image_urls:
            for operation in request.operations:
                task_id = str(uuid.uuid4())
                task_ids.append(task_id)
                
                # Create task data
                task_data = {
                    "task_id": task_id,
                    "batch_id": batch_id,
                    "task_type": operation.get("type", "process_image"),
                    "input_data": {
                        "image_url": image_url,
                        **operation
                    },
                    "created_at": time.time()
                }
                
                # Queue task for processing
                await message_queue.publish_task("batch_process", task_data)
        
        logger.info(f"Batch processing queued", extra={
            "batch_id": batch_id,
            "total_images": len(request.image_urls),
            "total_operations": len(request.operations),
            "total_tasks": len(task_ids)
        })
        
        return BatchProcessingResponse(
            batch_id=batch_id,
            task_ids=task_ids,
            total_tasks=len(task_ids),
            message="Batch processing queued successfully"
        )
        
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch processing failed: {str(e)}"
        )


@router.get("/tasks/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    """Get task processing status."""
    try:
        # TODO: Implement database lookup for task status
        # For now, return a placeholder response
        return TaskStatus(
            task_id=task_id,
            status=ProcessingStatus.PROCESSING,
            created_at=time.time(),
            updated_at=time.time(),
            progress=50
        )
        
    except Exception as e:
        logger.error(f"Failed to get task status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task status: {str(e)}"
        )


@router.get("/image-info")
async def get_image_info(image_url: str = Query(..., description="URL of the image to analyze")):
    """Get comprehensive image information."""
    try:
        # Download image from URL
        storage_url, file_info = await storage_service.upload_from_url(image_url)
        image_data = await storage_service.download_file(file_info['key'])
        
        # Get image information
        image_info = await image_processor.get_image_info(image_data)
        
        logger.info(f"Image info retrieved", extra={
            "image_url": image_url,
            "format": image_info.get("format"),
            "size": image_info.get("size")
        })
        
        return {
            "success": True,
            "image_info": image_info,
            "source_url": image_url
        }
        
    except Exception as e:
        logger.error(f"Failed to get image info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get image info: {str(e)}"
        )