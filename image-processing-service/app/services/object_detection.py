"""Object detection service using YOLO and other pre-trained models."""
import asyncio
import io
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image
from ultralytics import YOLO

from app.core.config import settings
from app.core.logging import get_logger
from app.models.schemas import BoundingBox, DetectedObject

logger = get_logger(__name__)


class ObjectDetectionError(Exception):
    """Object detection specific error."""
    pass


class ObjectDetectionService:
    """Object detection service with multiple model backends."""
    
    def __init__(self):
        self.yolo_model = None
        self.confidence_threshold = settings.DETECTION_CONFIDENCE
        self.model_path = settings.YOLO_MODEL_PATH
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        # COCO class names for YOLO
        self.coco_classes = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
            'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
            'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
            'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
            'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
            'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
            'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
            'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
            'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
            'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
            'toothbrush'
        ]
    
    async def _load_yolo_model(self):
        """Load YOLO model lazily."""
        if self.yolo_model is None:
            try:
                self.yolo_model = YOLO(self.model_path)
                self.yolo_model.to(self.device)
                logger.info(f"YOLO model loaded successfully on {self.device}")
            except Exception as e:
                logger.error(f"Failed to load YOLO model: {e}")
                raise ObjectDetectionError(f"Model loading failed: {str(e)}")
        
        return self.yolo_model
    
    async def detect_objects_yolo(
        self,
        image_data: bytes,
        confidence_threshold: float = None,
        max_detections: int = 100,
        classes_filter: Optional[List[str]] = None
    ) -> List[DetectedObject]:
        """Detect objects using YOLO model."""
        try:
            # Load model
            model = await self._load_yolo_model()
            
            # Convert image data to numpy array
            image_array = np.frombuffer(image_data, dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ObjectDetectionError("Failed to decode image")
            
            # Get image dimensions
            height, width = image.shape[:2]
            
            # Set confidence threshold
            conf_threshold = confidence_threshold or self.confidence_threshold
            
            # Run inference
            results = model(image, conf=conf_threshold, verbose=False)
            
            detected_objects = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    # Get detection data
                    xyxy = boxes.xyxy.cpu().numpy()  # Bounding boxes
                    conf = boxes.conf.cpu().numpy()  # Confidence scores
                    cls = boxes.cls.cpu().numpy()    # Class indices
                    
                    for i in range(len(xyxy)):
                        # Get class name
                        class_idx = int(cls[i])
                        class_name = self.coco_classes[class_idx] if class_idx < len(self.coco_classes) else f"class_{class_idx}"
                        
                        # Filter by class if specified
                        if classes_filter and class_name not in classes_filter:
                            continue
                        
                        # Create bounding box
                        x1, y1, x2, y2 = xyxy[i]
                        bbox = BoundingBox(
                            x1=float(x1),
                            y1=float(y1),
                            x2=float(x2),
                            y2=float(y2),
                            confidence=float(conf[i])
                        )
                        
                        # Create detected object
                        detected_obj = DetectedObject(
                            class_name=class_name,
                            confidence=float(conf[i]),
                            bbox=bbox
                        )
                        
                        detected_objects.append(detected_obj)
                        
                        # Limit number of detections
                        if len(detected_objects) >= max_detections:
                            break
            
            # Sort by confidence
            detected_objects.sort(key=lambda x: x.confidence, reverse=True)
            
            logger.info(f"YOLO detection completed", extra={
                "objects_detected": len(detected_objects),
                "confidence_threshold": conf_threshold,
                "image_size": f"{width}x{height}"
            })
            
            return detected_objects
            
        except Exception as e:
            logger.error(f"YOLO object detection failed: {e}")
            raise ObjectDetectionError(f"YOLO detection failed: {str(e)}")
    
    async def detect_faces(
        self,
        image_data: bytes,
        confidence_threshold: float = 0.5
    ) -> List[DetectedObject]:
        """Detect faces using OpenCV Haar cascades."""
        try:
            # Convert image data to OpenCV format
            image_array = np.frombuffer(image_data, dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Load Haar cascade for face detection
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            
            # Detect faces
            faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )
            
            detected_faces = []
            for (x, y, w, h) in faces:
                bbox = BoundingBox(
                    x1=float(x),
                    y1=float(y),
                    x2=float(x + w),
                    y2=float(y + h),
                    confidence=1.0  # Haar cascades don't provide confidence
                )
                
                detected_face = DetectedObject(
                    class_name="face",
                    confidence=1.0,
                    bbox=bbox
                )
                
                detected_faces.append(detected_face)
            
            logger.info(f"Face detection completed", extra={
                "faces_detected": len(detected_faces)
            })
            
            return detected_faces
            
        except Exception as e:
            logger.error(f"Face detection failed: {e}")
            raise ObjectDetectionError(f"Face detection failed: {str(e)}")
    
    async def detect_edges_and_contours(
        self,
        image_data: bytes,
        edge_threshold1: int = 50,
        edge_threshold2: int = 150
    ) -> Dict[str, any]:
        """Detect edges and contours in image."""
        try:
            # Convert image data to OpenCV format
            image_array = np.frombuffer(image_data, dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Edge detection using Canny
            edges = cv2.Canny(gray, edge_threshold1, edge_threshold2)
            
            # Find contours
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Process contours
            contour_data = []
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > 100:  # Filter small contours
                    # Get bounding rectangle
                    x, y, w, h = cv2.boundingRect(contour)
                    
                    # Calculate contour properties
                    perimeter = cv2.arcLength(contour, True)
                    approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
                    
                    contour_data.append({
                        "area": float(area),
                        "perimeter": float(perimeter),
                        "vertices": len(approx),
                        "bbox": {
                            "x": int(x),
                            "y": int(y),
                            "width": int(w),
                            "height": int(h)
                        }
                    })
            
            # Sort by area (largest first)
            contour_data.sort(key=lambda x: x["area"], reverse=True)
            
            return {
                "total_contours": len(contour_data),
                "contours": contour_data[:50],  # Limit to top 50
                "edge_pixels": int(np.sum(edges > 0))
            }
            
        except Exception as e:
            logger.error(f"Edge/contour detection failed: {e}")
            raise ObjectDetectionError(f"Edge detection failed: {str(e)}")
    
    async def analyze_image_composition(
        self,
        image_data: bytes
    ) -> Dict[str, any]:
        """Analyze image composition and features."""
        try:
            # Convert image data to OpenCV format
            image_array = np.frombuffer(image_data, dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            height, width = image.shape[:2]
            
            # Color analysis
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            
            # Calculate color distribution
            colors = {
                "mean_hue": float(np.mean(hsv[:, :, 0])),
                "mean_saturation": float(np.mean(hsv[:, :, 1])),
                "mean_value": float(np.mean(hsv[:, :, 2])),
                "dominant_colors": await self._get_dominant_colors(image)
            }
            
            # Texture analysis using Local Binary Patterns
            from skimage import feature
            lbp = feature.local_binary_pattern(gray, 24, 8, method='uniform')
            texture_hist, _ = np.histogram(lbp.ravel(), bins=26)
            
            # Edge density
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / (width * height)
            
            # Brightness analysis
            brightness = {
                "mean": float(np.mean(gray)),
                "std": float(np.std(gray)),
                "histogram": np.histogram(gray, bins=16)[0].tolist()
            }
            
            return {
                "dimensions": {"width": width, "height": height},
                "colors": colors,
                "brightness": brightness,
                "edge_density": float(edge_density),
                "texture_uniformity": float(np.std(texture_hist)),
                "aspect_ratio": float(width / height)
            }
            
        except Exception as e:
            logger.error(f"Image composition analysis failed: {e}")
            raise ObjectDetectionError(f"Composition analysis failed: {str(e)}")
    
    async def _get_dominant_colors(self, image: np.ndarray, k: int = 5) -> List[List[int]]:
        """Extract dominant colors using K-means clustering."""
        try:
            from sklearn.cluster import KMeans
            
            # Reshape image to be a list of pixels
            data = image.reshape((-1, 3))
            
            # Apply K-means clustering
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            kmeans.fit(data)
            
            # Get the colors
            colors = kmeans.cluster_centers_.astype(int)
            
            # Convert BGR to RGB and return as list
            return [color[::-1].tolist() for color in colors]
            
        except ImportError:
            logger.warning("scikit-learn not available for color analysis")
            return []
        except Exception as e:
            logger.warning(f"Dominant color extraction failed: {e}")
            return []
    
    async def detect_text_regions(
        self,
        image_data: bytes
    ) -> List[DetectedObject]:
        """Detect text regions using EAST text detector or simple methods."""
        try:
            # Convert image data to OpenCV format
            image_array = np.frombuffer(image_data, dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Simple text region detection using morphological operations
            # Apply threshold
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            # Create rectangular kernel for text detection
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (18, 18))
            
            # Apply morphological operations
            connected = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(connected, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            text_regions = []
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > 500:  # Filter small regions
                    x, y, w, h = cv2.boundingRect(contour)
                    
                    # Check aspect ratio to filter text-like regions
                    aspect_ratio = w / h
                    if 0.2 < aspect_ratio < 10:  # Text regions have certain aspect ratios
                        bbox = BoundingBox(
                            x1=float(x),
                            y1=float(y),
                            x2=float(x + w),
                            y2=float(y + h),
                            confidence=0.8  # Estimated confidence
                        )
                        
                        text_region = DetectedObject(
                            class_name="text_region",
                            confidence=0.8,
                            bbox=bbox
                        )
                        
                        text_regions.append(text_region)
            
            logger.info(f"Text region detection completed", extra={
                "regions_detected": len(text_regions)
            })
            
            return text_regions
            
        except Exception as e:
            logger.error(f"Text region detection failed: {e}")
            raise ObjectDetectionError(f"Text region detection failed: {str(e)}")


# Global object detection service instance
object_detection_service = ObjectDetectionService()