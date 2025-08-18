"""Async task processor for handling image processing jobs."""
import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.logging import get_logger, set_correlation_id
from app.models.database import Task
from app.models.schemas import ProcessingStatus
from app.services.image_processor import image_processor
from app.services.message_queue import message_queue
from app.services.metrics import metrics_collector
from app.services.ocr_service import ocr_service
from app.services.object_detection import object_detection_service
from app.services.storage import storage_service

logger = get_logger(__name__)


class TaskProcessor:
    """Async task processor for image processing operations."""
    
    def __init__(self, worker_id: str = None):
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"
        self.running = False
        self.processed_count = 0
        self.error_count = 0
        self.start_time = None
        
    async def start(self):
        """Start the task processor."""
        self.running = True
        self.start_time = time.time()
        
        logger.info(f"Task processor {self.worker_id} starting")
        
        # Start consuming tasks
        await message_queue.consume_tasks("image_processing", self.process_task)
        
        logger.info(f"Task processor {self.worker_id} started")
    
    async def stop(self):
        """Stop the task processor."""
        self.running = False
        logger.info(f"Task processor {self.worker_id} stopping")
    
    async def process_task(self, task_data: Dict[str, Any]):
        """Process a single task."""
        task_id = task_data.get("task_id")
        correlation_id = task_data.get("correlation_id", str(uuid.uuid4()))
        
        # Set correlation ID for logging
        set_correlation_id(correlation_id)
        
        start_time = time.time()
        
        try:
            logger.info(f"Processing task {task_id}", extra={
                "task_id": task_id,
                "worker_id": self.worker_id,
                "task_type": task_data.get("task_type")
            })
            
            # Update task status to processing
            await self._update_task_status(task_id, ProcessingStatus.PROCESSING)
            
            # Process based on task type
            task_type = task_data.get("task_type")
            result = await self._execute_task(task_type, task_data)
            
            # Calculate processing time
            processing_time = time.time() - start_time
            
            # Update task with result
            await self._update_task_completion(task_id, result, processing_time)
            
            # Publish result
            await message_queue.publish_result(task_id, {
                "status": "completed",
                "result": result,
                "processing_time": processing_time,
                "worker_id": self.worker_id,
                "completed_at": datetime.utcnow().isoformat()
            })
            
            # Update metrics
            metrics_collector.record_task_processing(task_type, processing_time, "success")
            
            self.processed_count += 1
            
            logger.info(f"Task {task_id} completed successfully", extra={
                "task_id": task_id,
                "processing_time": processing_time,
                "worker_id": self.worker_id
            })
            
        except Exception as e:
            processing_time = time.time() - start_time
            error_message = str(e)
            
            logger.error(f"Task {task_id} failed: {error_message}", extra={
                "task_id": task_id,
                "worker_id": self.worker_id,
                "error": error_message
            })
            
            # Update task status to failed
            await self._update_task_status(
                task_id, 
                ProcessingStatus.FAILED, 
                error_message=error_message
            )
            
            # Publish error result
            await message_queue.publish_result(task_id, {
                "status": "failed",
                "error": error_message,
                "processing_time": processing_time,
                "worker_id": self.worker_id,
                "failed_at": datetime.utcnow().isoformat()
            })
            
            # Update metrics
            metrics_collector.record_task_processing(
                task_data.get("task_type", "unknown"), 
                processing_time, 
                "failed"
            )
            
            self.error_count += 1
    
    async def _execute_task(self, task_type: str, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute specific task based on type."""
        if task_type == "resize_image":
            return await self._process_resize_task(task_data)
        elif task_type == "crop_image":
            return await self._process_crop_task(task_data)
        elif task_type == "apply_filter":
            return await self._process_filter_task(task_data)
        elif task_type == "extract_text":
            return await self._process_ocr_task(task_data)
        elif task_type == "detect_objects":
            return await self._process_object_detection_task(task_data)
        elif task_type == "enhance_image":
            return await self._process_enhancement_task(task_data)
        elif task_type == "batch_process":
            return await self._process_batch_task(task_data)
        else:
            raise ValueError(f"Unknown task type: {task_type}")
    
    async def _process_resize_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process image resize task."""
        input_data = task_data["data"]["input_data"]
        
        # Download image from storage
        image_data = await storage_service.download_file(input_data["image_key"])
        
        # Resize image
        resized_data = await image_processor.resize_image(
            image_data,
            input_data["width"],
            input_data["height"],
            input_data.get("maintain_aspect_ratio", True),
            input_data.get("output_format", "jpeg"),
            input_data.get("quality", 85)
        )
        
        # Upload result
        output_key = storage_service.generate_file_key(
            input_data.get("output_format", "jpeg"),
            "processed"
        )
        output_url = await storage_service.upload_file(
            resized_data,
            output_key,
            f"image/{input_data.get('output_format', 'jpeg')}"
        )
        
        # Record metrics
        metrics_collector.record_image_processing(
            "resize", 0, len(resized_data)
        )
        
        return {
            "output_url": output_url,
            "output_key": output_key,
            "output_size": len(resized_data),
            "dimensions": f"{input_data['width']}x{input_data['height']}"
        }
    
    async def _process_crop_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process image crop task."""
        input_data = task_data["data"]["input_data"]
        
        # Download image from storage
        image_data = await storage_service.download_file(input_data["image_key"])
        
        # Crop image
        cropped_data = await image_processor.crop_image(
            image_data,
            input_data["x"],
            input_data["y"],
            input_data["width"],
            input_data["height"],
            input_data.get("output_format", "jpeg"),
            input_data.get("quality", 85)
        )
        
        # Upload result
        output_key = storage_service.generate_file_key(
            input_data.get("output_format", "jpeg"),
            "processed"
        )
        output_url = await storage_service.upload_file(
            cropped_data,
            output_key,
            f"image/{input_data.get('output_format', 'jpeg')}"
        )
        
        # Record metrics
        metrics_collector.record_image_processing(
            "crop", 0, len(cropped_data)
        )
        
        return {
            "output_url": output_url,
            "output_key": output_key,
            "output_size": len(cropped_data),
            "crop_area": f"{input_data['x']},{input_data['y']},{input_data['width']}x{input_data['height']}"
        }
    
    async def _process_filter_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process image filter task."""
        input_data = task_data["data"]["input_data"]
        
        # Download image from storage
        image_data = await storage_service.download_file(input_data["image_key"])
        
        # Apply filter
        filtered_data = await image_processor.apply_filter(
            image_data,
            input_data["filter_type"],
            input_data.get("intensity", 1.0),
            input_data.get("output_format", "jpeg"),
            input_data.get("quality", 85)
        )
        
        # Upload result
        output_key = storage_service.generate_file_key(
            input_data.get("output_format", "jpeg"),
            "processed"
        )
        output_url = await storage_service.upload_file(
            filtered_data,
            output_key,
            f"image/{input_data.get('output_format', 'jpeg')}"
        )
        
        # Record metrics
        metrics_collector.record_image_processing(
            "filter", 0, len(filtered_data)
        )
        
        return {
            "output_url": output_url,
            "output_key": output_key,
            "output_size": len(filtered_data),
            "filter_applied": input_data["filter_type"]
        }
    
    async def _process_ocr_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process OCR text extraction task."""
        input_data = task_data["data"]["input_data"]
        
        # Download image from storage
        image_data = await storage_service.download_file(input_data["image_key"])
        
        # Extract text
        ocr_results = await ocr_service.extract_text_tesseract(
            image_data,
            input_data.get("languages", ["eng"]),
            input_data.get("detect_orientation", True),
            input_data.get("extract_confidence", True)
        )
        
        # Process results
        extracted_texts = []
        total_confidence = 0
        for result in ocr_results:
            extracted_texts.append({
                "text": result.text,
                "confidence": result.confidence,
                "bbox": {
                    "x1": result.bbox.x1,
                    "y1": result.bbox.y1,
                    "x2": result.bbox.x2,
                    "y2": result.bbox.y2
                } if result.bbox else None
            })
            if result.confidence:
                total_confidence += result.confidence
        
        avg_confidence = total_confidence / len(ocr_results) if ocr_results else 0
        
        # Record metrics
        total_text_length = sum(len(result.text) for result in ocr_results)
        metrics_collector.record_ocr_result(
            "tesseract", 
            ",".join(input_data.get("languages", ["eng"])),
            total_text_length,
            avg_confidence
        )
        
        return {
            "extracted_texts": extracted_texts,
            "total_texts": len(extracted_texts),
            "average_confidence": avg_confidence,
            "total_characters": total_text_length
        }
    
    async def _process_object_detection_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process object detection task."""
        input_data = task_data["data"]["input_data"]
        
        # Download image from storage
        image_data = await storage_service.download_file(input_data["image_key"])
        
        # Detect objects
        detected_objects = await object_detection_service.detect_objects_yolo(
            image_data,
            input_data.get("confidence_threshold", 0.5),
            input_data.get("max_detections", 100),
            input_data.get("classes_filter")
        )
        
        # Process results
        objects_data = []
        for obj in detected_objects:
            objects_data.append({
                "class_name": obj.class_name,
                "confidence": obj.confidence,
                "bbox": {
                    "x1": obj.bbox.x1,
                    "y1": obj.bbox.y1,
                    "x2": obj.bbox.x2,
                    "y2": obj.bbox.y2
                }
            })
        
        # Record metrics
        metrics_collector.record_object_detection("yolo", objects_data)
        
        return {
            "detected_objects": objects_data,
            "total_objects": len(objects_data),
            "classes_detected": list(set(obj.class_name for obj in detected_objects))
        }
    
    async def _process_enhancement_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process image enhancement task."""
        input_data = task_data["data"]["input_data"]
        
        # Download image from storage
        image_data = await storage_service.download_file(input_data["image_key"])
        
        # Enhance image
        enhanced_data = await image_processor.enhance_image(
            image_data,
            input_data.get("brightness", 1.0),
            input_data.get("contrast", 1.0),
            input_data.get("saturation", 1.0),
            input_data.get("sharpness", 1.0),
            input_data.get("output_format", "jpeg"),
            input_data.get("quality", 85)
        )
        
        # Upload result
        output_key = storage_service.generate_file_key(
            input_data.get("output_format", "jpeg"),
            "processed"
        )
        output_url = await storage_service.upload_file(
            enhanced_data,
            output_key,
            f"image/{input_data.get('output_format', 'jpeg')}"
        )
        
        # Record metrics
        metrics_collector.record_image_processing(
            "enhance", 0, len(enhanced_data)
        )
        
        return {
            "output_url": output_url,
            "output_key": output_key,
            "output_size": len(enhanced_data),
            "enhancements_applied": {
                "brightness": input_data.get("brightness", 1.0),
                "contrast": input_data.get("contrast", 1.0),
                "saturation": input_data.get("saturation", 1.0),
                "sharpness": input_data.get("sharpness", 1.0)
            }
        }
    
    async def _process_batch_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process batch processing task."""
        input_data = task_data["data"]["input_data"]
        operations = input_data["operations"]
        image_keys = input_data["image_keys"]
        
        results = []
        for image_key in image_keys:
            image_results = {}
            
            # Download image once
            image_data = await storage_service.download_file(image_key)
            
            # Apply all operations
            for operation in operations:
                try:
                    if operation["type"] == "resize":
                        result_data = await image_processor.resize_image(
                            image_data,
                            operation["width"],
                            operation["height"],
                            operation.get("maintain_aspect_ratio", True)
                        )
                    elif operation["type"] == "filter":
                        result_data = await image_processor.apply_filter(
                            image_data,
                            operation["filter_type"],
                            operation.get("intensity", 1.0)
                        )
                    else:
                        continue
                    
                    # Upload result
                    output_key = storage_service.generate_file_key(
                        "jpeg", f"batch/{operation['type']}"
                    )
                    output_url = await storage_service.upload_file(
                        result_data, output_key, "image/jpeg"
                    )
                    
                    image_results[operation["type"]] = {
                        "output_url": output_url,
                        "output_key": output_key,
                        "output_size": len(result_data)
                    }
                    
                except Exception as e:
                    image_results[operation["type"]] = {
                        "error": str(e)
                    }
            
            results.append({
                "input_key": image_key,
                "operations": image_results
            })
        
        return {
            "batch_results": results,
            "total_images": len(image_keys),
            "total_operations": len(operations)
        }
    
    async def _update_task_status(
        self, 
        task_id: str, 
        status: ProcessingStatus, 
        error_message: str = None
    ):
        """Update task status in database."""
        # TODO: Implement database update
        pass
    
    async def _update_task_completion(
        self, 
        task_id: str, 
        result: Dict[str, Any], 
        processing_time: float
    ):
        """Update task with completion result."""
        # TODO: Implement database update
        pass
    
    def get_stats(self) -> Dict[str, Any]:
        """Get worker statistics."""
        uptime = time.time() - self.start_time if self.start_time else 0
        
        return {
            "worker_id": self.worker_id,
            "running": self.running,
            "uptime_seconds": round(uptime, 2),
            "processed_count": self.processed_count,
            "error_count": self.error_count,
            "success_rate": (
                (self.processed_count - self.error_count) / self.processed_count 
                if self.processed_count > 0 else 0
            )
        }


# Function to create and start worker
async def create_worker(worker_id: str = None) -> TaskProcessor:
    """Create and start a new task processor worker."""
    worker = TaskProcessor(worker_id)
    await worker.start()
    return worker