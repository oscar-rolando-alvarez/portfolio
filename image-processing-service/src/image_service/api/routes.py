"""HTTP API for image processing, analysis and storage."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from PIL import Image
from prometheus_client import Histogram
from pydantic import BaseModel

from image_service import extras, processing
from image_service.config import Settings, get_settings
from image_service.genai.vision import VisionAnalyzer, VisionResult, VisionUnavailableError
from image_service.processing import FilterType, ImageError, ImageInfo, ImageLimits, OutputFormat
from image_service.storage import Storage

router = APIRouter(prefix="/api/v1", tags=["images"])

OPERATION_SECONDS = Histogram(
    "image_operation_duration_seconds", "Image operation latency", labelnames=("operation",)
)


class ImageInfoOut(BaseModel):
    format: str
    mode: str
    width: int
    height: int
    size_bytes: int
    has_alpha: bool
    orientation: str
    mean_rgb: tuple[float, float, float]
    dominant_rgb: tuple[int, int, int]
    brightness: float
    sharpness: float

    @classmethod
    def from_info(cls, info: ImageInfo) -> ImageInfoOut:
        return cls(**asdict(info), orientation=info.orientation)


class AnalysisOut(BaseModel):
    info: ImageInfoOut
    vision: VisionResult
    provider: str


class StoredImageOut(BaseModel):
    key: str
    url: str
    info: ImageInfoOut


class OcrOut(BaseModel):
    text: str


class DetectionOut(BaseModel):
    label: str
    confidence: float
    box: tuple[float, float, float, float]


def get_limits(settings: Annotated[Settings, Depends(get_settings)]) -> ImageLimits:
    return ImageLimits(
        max_bytes=settings.max_upload_bytes,
        max_pixels=settings.max_pixels,
        allowed_formats=frozenset(f.upper() for f in settings.allowed_formats),
        max_output_dimension=settings.max_output_dimension,
    )


def get_storage(request: Request) -> Storage:
    storage: Storage = request.app.state.storage
    return storage


def get_vision(request: Request) -> VisionAnalyzer | None:
    analyzer: VisionAnalyzer | None = request.app.state.vision
    return analyzer


Limits = Annotated[ImageLimits, Depends(get_limits)]
Upload = Annotated[UploadFile, File(description="Image file (JPEG, PNG, WEBP, GIF, BMP, TIFF)")]


async def read_image(upload: UploadFile, limits: ImageLimits) -> tuple[Image.Image, bytes]:
    # Read at most limit + 1 bytes into memory; the ingress should also cap request bodies.
    data = await upload.read(limits.max_bytes + 1)
    try:
        image = await asyncio.to_thread(processing.load_image, data, limits)
    except ImageError as exc:
        code = (
            status.HTTP_413_CONTENT_TOO_LARGE
            if len(data) > limits.max_bytes
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        raise HTTPException(code, detail=str(exc)) from exc
    return image, data


async def run_op(name: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    started = time.perf_counter()
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except ImageError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    finally:
        OPERATION_SECONDS.labels(name).observe(time.perf_counter() - started)


async def respond(image: Image.Image, fmt: OutputFormat, quality: int) -> Response:
    if not 1 <= quality <= 100:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="quality must be 1-100")
    body = await asyncio.to_thread(processing.encode, image, fmt, quality)
    return Response(
        body,
        media_type=fmt.media_type,
        headers={"X-Image-Width": str(image.width), "X-Image-Height": str(image.height)},
    )


IMAGE_RESPONSE: dict[int | str, dict[str, Any]] = {
    200: {"content": {"image/jpeg": {}, "image/png": {}, "image/webp": {}}}
}


@router.post("/images/info", response_model=ImageInfoOut)
async def image_info(file: Upload, limits: Limits) -> ImageInfoOut:
    image, data = await read_image(file, limits)
    info = await run_op("info", processing.describe, image, len(data))
    return ImageInfoOut.from_info(info)


@router.post("/images/resize", response_class=Response, responses=IMAGE_RESPONSE)
async def resize_image(
    file: Upload,
    limits: Limits,
    width: Annotated[int, Form(gt=0)],
    height: Annotated[int, Form(gt=0)],
    keep_aspect: Annotated[bool, Form()] = True,
    output_format: Annotated[OutputFormat, Form()] = OutputFormat.JPEG,
    quality: Annotated[int, Form()] = 85,
) -> Response:
    image, _ = await read_image(file, limits)
    out = await run_op(
        "resize", processing.resize, image, width, height, limits, keep_aspect=keep_aspect
    )
    return await respond(out, output_format, quality)


@router.post("/images/crop", response_class=Response, responses=IMAGE_RESPONSE)
async def crop_image(
    file: Upload,
    limits: Limits,
    x: Annotated[int, Form(ge=0)],
    y: Annotated[int, Form(ge=0)],
    width: Annotated[int, Form(gt=0)],
    height: Annotated[int, Form(gt=0)],
    output_format: Annotated[OutputFormat, Form()] = OutputFormat.PNG,
    quality: Annotated[int, Form()] = 85,
) -> Response:
    image, _ = await read_image(file, limits)
    out = await run_op("crop", processing.crop, image, x, y, width, height)
    return await respond(out, output_format, quality)


@router.post("/images/thumbnail", response_class=Response, responses=IMAGE_RESPONSE)
async def thumbnail_image(
    file: Upload,
    limits: Limits,
    size: Annotated[int, Form()] = 256,
    output_format: Annotated[OutputFormat, Form()] = OutputFormat.WEBP,
    quality: Annotated[int, Form()] = 80,
) -> Response:
    image, _ = await read_image(file, limits)
    out = await run_op("thumbnail", processing.thumbnail, image, size)
    return await respond(out, output_format, quality)


@router.post("/images/filter", response_class=Response, responses=IMAGE_RESPONSE)
async def filter_image(
    file: Upload,
    limits: Limits,
    filter_type: Annotated[FilterType, Form()],
    intensity: Annotated[float, Form()] = 1.0,
    output_format: Annotated[OutputFormat, Form()] = OutputFormat.JPEG,
    quality: Annotated[int, Form()] = 85,
) -> Response:
    image, _ = await read_image(file, limits)
    out = await run_op("filter", processing.apply_filter, image, filter_type, intensity)
    return await respond(out, output_format, quality)


@router.post("/images/enhance", response_class=Response, responses=IMAGE_RESPONSE)
async def enhance_image(
    file: Upload,
    limits: Limits,
    brightness: Annotated[float, Form()] = 1.0,
    contrast: Annotated[float, Form()] = 1.0,
    saturation: Annotated[float, Form()] = 1.0,
    sharpness: Annotated[float, Form()] = 1.0,
    output_format: Annotated[OutputFormat, Form()] = OutputFormat.JPEG,
    quality: Annotated[int, Form()] = 85,
) -> Response:
    image, _ = await read_image(file, limits)
    out = await run_op(
        "enhance",
        processing.enhance,
        image,
        brightness=brightness,
        contrast=contrast,
        saturation=saturation,
        sharpness=sharpness,
    )
    return await respond(out, output_format, quality)


@router.post("/images/analyze", response_model=AnalysisOut)
async def analyze_image(
    file: Upload,
    limits: Limits,
    vision: Annotated[VisionAnalyzer | None, Depends(get_vision)],
) -> AnalysisOut:
    """Caption, tags and alt text from a vision model (or the deterministic fake)."""
    if vision is None:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail="Vision analysis is disabled")
    image, data = await read_image(file, limits)
    info = await run_op("info", processing.describe, image, len(data))
    started = time.perf_counter()
    try:
        result = await vision.analyze(image, info)
    except VisionUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    finally:
        OPERATION_SECONDS.labels("analyze").observe(time.perf_counter() - started)
    return AnalysisOut(info=ImageInfoOut.from_info(info), vision=result, provider=vision.name)


@router.post("/images/ocr", response_model=OcrOut)
async def ocr_image(
    file: Upload, limits: Limits, settings: Annotated[Settings, Depends(get_settings)]
) -> OcrOut:
    image, _ = await read_image(file, limits)
    try:
        text = await asyncio.to_thread(extras.extract_text, image, settings.ocr_languages)
    except extras.FeatureUnavailableError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
    return OcrOut(text=text)


@router.post("/images/detect", response_model=list[DetectionOut])
async def detect_objects(
    file: Upload, limits: Limits, settings: Annotated[Settings, Depends(get_settings)]
) -> list[DetectionOut]:
    image, _ = await read_image(file, limits)
    try:
        found = await asyncio.to_thread(
            extras.detect_objects, image, settings.detection_model, settings.detection_confidence
        )
    except extras.FeatureUnavailableError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=str(exc)) from exc
    return [DetectionOut(label=d.label, confidence=d.confidence, box=d.box) for d in found]


@router.post("/images", response_model=StoredImageOut, status_code=status.HTTP_201_CREATED)
async def store_image(
    file: Upload, limits: Limits, storage: Annotated[Storage, Depends(get_storage)]
) -> StoredImageOut:
    image, data = await read_image(file, limits)
    info = await run_op("info", processing.describe, image, len(data))
    key = await storage.put(data, info.format.lower())
    return StoredImageOut(key=key, url=f"/api/v1/images/{key}", info=ImageInfoOut.from_info(info))


@router.get("/images/{key}", response_class=Response, responses=IMAGE_RESPONSE)
async def get_image(key: str, storage: Annotated[Storage, Depends(get_storage)]) -> Response:
    data = await storage.get(key)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Image not found")
    extension = key.rsplit(".", 1)[-1]
    return Response(
        data,
        media_type=f"image/{extension}",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
