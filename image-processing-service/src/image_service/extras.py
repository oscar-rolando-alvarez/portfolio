"""Optional heavy capabilities (OCR, object detection), imported lazily.

The core service never imports these libraries at start-up; endpoints return HTTP 501 with an
installation hint when the extra is not available.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from typing import Any

from PIL import Image


class FeatureUnavailableError(RuntimeError):
    def __init__(self, feature: str, hint: str) -> None:
        super().__init__(f"{feature} is not available: {hint}")


@dataclass(frozen=True, slots=True)
class Detection:
    label: str
    confidence: float
    box: tuple[float, float, float, float]


def extract_text(image: Image.Image, languages: str = "eng") -> str:
    try:
        import pytesseract
    except ImportError as exc:
        raise FeatureUnavailableError("OCR", "install the `ocr` extra and tesseract") from exc
    try:
        text: str = pytesseract.image_to_string(image.convert("RGB"), lang=languages)
    except pytesseract.TesseractNotFoundError as exc:
        raise FeatureUnavailableError("OCR", "the tesseract binary is not installed") from exc
    return text.strip()


@cache
def _yolo(model_name: str) -> Any:
    from ultralytics import YOLO

    return YOLO(model_name)


def detect_objects(image: Image.Image, model_name: str, confidence: float) -> list[Detection]:
    try:
        model = _yolo(model_name)
    except ImportError as exc:
        raise FeatureUnavailableError("Object detection", "install the `detection` extra") from exc
    results = model.predict(image.convert("RGB"), conf=confidence, verbose=False)
    detections: list[Detection] = []
    for result in results:
        names = result.names
        for box in result.boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            detections.append(
                Detection(names[int(box.cls[0])], round(float(box.conf[0]), 4), (x1, y1, x2, y2))
            )
    return detections
