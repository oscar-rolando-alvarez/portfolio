"""OCR text extraction service using Tesseract and EasyOCR."""
import asyncio
import io
from typing import List, Dict, Optional, Tuple

import cv2
import easyocr
import numpy as np
import pytesseract
from PIL import Image

from app.core.config import settings
from app.core.logging import get_logger
from app.models.schemas import OCRResult, BoundingBox

logger = get_logger(__name__)


class OCRError(Exception):
    """OCR processing error."""
    pass


class OCRService:
    """OCR text extraction service with multiple backends."""
    
    def __init__(self):
        self.tesseract_cmd = settings.TESSERACT_CMD
        self.supported_languages = settings.OCR_LANGUAGES
        self.easyocr_reader = None
        
        # Configure Tesseract if path is specified
        if self.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self.tesseract_cmd
    
    async def _get_easyocr_reader(self, languages: List[str] = None):
        """Get EasyOCR reader instance."""
        if not self.easyocr_reader:
            # Initialize EasyOCR reader
            lang_list = languages or ['en']
            self.easyocr_reader = easyocr.Reader(lang_list, gpu=False)
        return self.easyocr_reader
    
    async def extract_text_tesseract(
        self,
        image_data: bytes,
        languages: List[str] = None,
        detect_orientation: bool = True,
        extract_confidence: bool = True
    ) -> List[OCRResult]:
        """Extract text using Tesseract OCR."""
        try:
            # Load image
            image = Image.open(io.BytesIO(image_data))
            
            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Convert to OpenCV format for preprocessing
            cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            # Preprocess image for better OCR results
            preprocessed = await self._preprocess_for_ocr(cv_image)
            
            # Convert back to PIL
            pil_image = Image.fromarray(cv2.cvtColor(preprocessed, cv2.COLOR_BGR2RGB))
            
            # Configure Tesseract
            lang_code = '+'.join(languages) if languages else 'eng'
            config = '--oem 3 --psm 6'  # LSTM engine, uniform text block
            
            if detect_orientation:
                config += ' -c tessedit_do_invert=0'
            
            # Extract text with bounding boxes and confidence
            if extract_confidence:
                data = pytesseract.image_to_data(
                    pil_image,
                    lang=lang_code,
                    config=config,
                    output_type=pytesseract.Output.DICT
                )
                
                results = []
                for i in range(len(data['text'])):
                    text = data['text'][i].strip()
                    if text and int(data['conf'][i]) > 0:
                        bbox = BoundingBox(
                            x1=float(data['left'][i]),
                            y1=float(data['top'][i]),
                            x2=float(data['left'][i] + data['width'][i]),
                            y2=float(data['top'][i] + data['height'][i]),
                            confidence=float(data['conf'][i]) / 100.0
                        )
                        
                        results.append(OCRResult(
                            text=text,
                            confidence=float(data['conf'][i]) / 100.0,
                            bbox=bbox
                        ))
                
                return results
            else:
                # Simple text extraction
                text = pytesseract.image_to_string(
                    pil_image,
                    lang=lang_code,
                    config=config
                ).strip()
                
                if text:
                    return [OCRResult(text=text)]
                return []
                
        except Exception as e:
            logger.error(f"Tesseract OCR failed: {e}")
            raise OCRError(f"Tesseract extraction failed: {str(e)}")
    
    async def extract_text_easyocr(
        self,
        image_data: bytes,
        languages: List[str] = None,
        extract_confidence: bool = True
    ) -> List[OCRResult]:
        """Extract text using EasyOCR."""
        try:
            # Convert languages to EasyOCR format
            lang_codes = []
            if languages:
                lang_map = {
                    'eng': 'en', 'spa': 'es', 'fra': 'fr', 'deu': 'de',
                    'ita': 'it', 'por': 'pt', 'rus': 'ru', 'ara': 'ar',
                    'hin': 'hi', 'tha': 'th', 'kor': 'ko', 'jpn': 'ja',
                    'chi_sim': 'ch_sim', 'chi_tra': 'ch_tra'
                }
                lang_codes = [lang_map.get(lang, 'en') for lang in languages]
            else:
                lang_codes = ['en']
            
            # Get EasyOCR reader
            reader = await self._get_easyocr_reader(lang_codes)
            
            # Convert image data to numpy array
            image_array = np.frombuffer(image_data, dtype=np.uint8)
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            # Extract text
            detections = reader.readtext(image)
            
            results = []
            for detection in detections:
                bbox_coords, text, confidence = detection
                
                if text.strip():
                    # Convert bbox coordinates
                    bbox = BoundingBox(
                        x1=float(min(coord[0] for coord in bbox_coords)),
                        y1=float(min(coord[1] for coord in bbox_coords)),
                        x2=float(max(coord[0] for coord in bbox_coords)),
                        y2=float(max(coord[1] for coord in bbox_coords)),
                        confidence=float(confidence)
                    )
                    
                    results.append(OCRResult(
                        text=text.strip(),
                        confidence=float(confidence) if extract_confidence else None,
                        bbox=bbox
                    ))
            
            return results
            
        except Exception as e:
            logger.error(f"EasyOCR failed: {e}")
            raise OCRError(f"EasyOCR extraction failed: {str(e)}")
    
    async def extract_text_hybrid(
        self,
        image_data: bytes,
        languages: List[str] = None,
        detect_orientation: bool = True,
        extract_confidence: bool = True
    ) -> Dict[str, List[OCRResult]]:
        """Extract text using both Tesseract and EasyOCR for comparison."""
        try:
            # Run both OCR engines concurrently
            tesseract_task = asyncio.create_task(
                self.extract_text_tesseract(
                    image_data, languages, detect_orientation, extract_confidence
                )
            )
            
            easyocr_task = asyncio.create_task(
                self.extract_text_easyocr(
                    image_data, languages, extract_confidence
                )
            )
            
            tesseract_results, easyocr_results = await asyncio.gather(
                tesseract_task, easyocr_task, return_exceptions=True
            )
            
            results = {}
            
            if not isinstance(tesseract_results, Exception):
                results['tesseract'] = tesseract_results
            else:
                logger.warning(f"Tesseract failed in hybrid mode: {tesseract_results}")
                results['tesseract'] = []
            
            if not isinstance(easyocr_results, Exception):
                results['easyocr'] = easyocr_results
            else:
                logger.warning(f"EasyOCR failed in hybrid mode: {easyocr_results}")
                results['easyocr'] = []
            
            return results
            
        except Exception as e:
            logger.error(f"Hybrid OCR failed: {e}")
            raise OCRError(f"Hybrid extraction failed: {str(e)}")
    
    async def _preprocess_for_ocr(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for better OCR results."""
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Apply adaptive threshold for better text contrast
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # Apply morphological operations to clean up the image
        kernel = np.ones((1, 1), np.uint8)
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)
        
        # Convert back to 3-channel for consistency
        return cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)
    
    async def detect_text_orientation(self, image_data: bytes) -> Dict[str, float]:
        """Detect text orientation in image."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Use Tesseract's orientation detection
            osd = pytesseract.image_to_osd(image, output_type=pytesseract.Output.DICT)
            
            return {
                'orientation': float(osd.get('orientation', 0)),
                'rotation': float(osd.get('rotate', 0)),
                'confidence': float(osd.get('orientation_conf', 0)) / 100.0
            }
            
        except Exception as e:
            logger.error(f"Orientation detection failed: {e}")
            return {'orientation': 0, 'rotation': 0, 'confidence': 0}
    
    async def extract_structured_data(
        self,
        image_data: bytes,
        data_type: str = "auto"
    ) -> Dict[str, any]:
        """Extract structured data like tables, forms, etc."""
        try:
            # First extract all text with bounding boxes
            results = await self.extract_text_tesseract(
                image_data, extract_confidence=True
            )
            
            if not results:
                return {"type": data_type, "data": []}
            
            # Simple table detection based on text alignment
            if data_type == "table" or data_type == "auto":
                table_data = await self._extract_table_structure(results)
                if table_data:
                    return {"type": "table", "data": table_data}
            
            # Form field detection
            if data_type == "form" or data_type == "auto":
                form_data = await self._extract_form_fields(results)
                if form_data:
                    return {"type": "form", "data": form_data}
            
            # Default: return all text with positions
            return {
                "type": "text",
                "data": [
                    {
                        "text": result.text,
                        "confidence": result.confidence,
                        "position": {
                            "x1": result.bbox.x1,
                            "y1": result.bbox.y1,
                            "x2": result.bbox.x2,
                            "y2": result.bbox.y2
                        }
                    }
                    for result in results
                ]
            }
            
        except Exception as e:
            logger.error(f"Structured data extraction failed: {e}")
            raise OCRError(f"Structured extraction failed: {str(e)}")
    
    async def _extract_table_structure(self, ocr_results: List[OCRResult]) -> Optional[List[List[str]]]:
        """Extract table structure from OCR results."""
        if len(ocr_results) < 4:  # Minimum for a 2x2 table
            return None
        
        # Group text by approximate Y positions (rows)
        y_positions = [result.bbox.y1 for result in ocr_results]
        y_positions.sort()
        
        # Group into rows with some tolerance
        rows = []
        current_row = []
        current_y = y_positions[0]
        tolerance = 10  # pixels
        
        for result in sorted(ocr_results, key=lambda x: (x.bbox.y1, x.bbox.x1)):
            if abs(result.bbox.y1 - current_y) <= tolerance:
                current_row.append(result)
            else:
                if current_row:
                    rows.append(current_row)
                current_row = [result]
                current_y = result.bbox.y1
        
        if current_row:
            rows.append(current_row)
        
        # Convert to table structure
        if len(rows) >= 2 and all(len(row) >= 2 for row in rows):
            table_data = []
            for row in rows:
                row_data = [cell.text for cell in sorted(row, key=lambda x: x.bbox.x1)]
                table_data.append(row_data)
            return table_data
        
        return None
    
    async def _extract_form_fields(self, ocr_results: List[OCRResult]) -> Optional[Dict[str, str]]:
        """Extract form field data from OCR results."""
        form_data = {}
        
        # Look for patterns like "Label: Value" or "Label ____"
        for i, result in enumerate(ocr_results):
            text = result.text.strip()
            
            # Check for colon-separated fields
            if ':' in text:
                parts = text.split(':', 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    value = parts[1].strip()
                    if key and value:
                        form_data[key] = value
            
            # Check for adjacent field/value pairs
            elif i < len(ocr_results) - 1:
                next_result = ocr_results[i + 1]
                # If current text looks like a label and next is close horizontally
                if (text.endswith(':') or text.lower() in ['name', 'email', 'phone', 'address']):
                    if abs(result.bbox.y1 - next_result.bbox.y1) <= 20:  # Same line
                        form_data[text.rstrip(':')] = next_result.text.strip()
        
        return form_data if form_data else None


# Global OCR service instance
ocr_service = OCRService()