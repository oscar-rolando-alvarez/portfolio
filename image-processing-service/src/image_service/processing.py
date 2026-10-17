"""Pure, synchronous image operations (Pillow + OpenCV). Called from a thread pool by the API."""

from __future__ import annotations

import enum
import io
import warnings
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError


class ImageError(ValueError):
    """Invalid input image or parameters (mapped to HTTP 4xx)."""


class OutputFormat(enum.StrEnum):
    JPEG = "jpeg"
    PNG = "png"
    WEBP = "webp"

    @property
    def media_type(self) -> str:
        return f"image/{self.value}"


class FilterType(enum.StrEnum):
    BLUR = "blur"
    SHARPEN = "sharpen"
    GRAYSCALE = "grayscale"
    EDGES = "edges"
    EMBOSS = "emboss"
    CONTOUR = "contour"
    MEDIAN = "median"
    SEPIA = "sepia"


@dataclass(frozen=True, slots=True)
class ImageLimits:
    max_bytes: int
    max_pixels: int
    allowed_formats: frozenset[str]
    max_output_dimension: int = 8000


@dataclass(frozen=True, slots=True)
class ImageInfo:
    format: str
    mode: str
    width: int
    height: int
    size_bytes: int
    has_alpha: bool
    mean_rgb: tuple[float, float, float]
    dominant_rgb: tuple[int, int, int]
    brightness: float
    sharpness: float

    @property
    def orientation(self) -> str:
        if self.width == self.height:
            return "square"
        return "landscape" if self.width > self.height else "portrait"


def load_image(data: bytes, limits: ImageLimits) -> Image.Image:
    """Decode and validate untrusted bytes (size, format, decompression-bomb guard)."""
    if not data:
        raise ImageError("Empty upload")
    if len(data) > limits.max_bytes:
        raise ImageError(f"Image exceeds the {limits.max_bytes // (1024 * 1024)} MB limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(data))
            probe.verify()  # detects truncated/corrupt files without full decode
            image = Image.open(io.BytesIO(data))
            fmt = image.format or ""
            if fmt not in limits.allowed_formats:
                raise ImageError(f"Unsupported format {fmt or 'unknown'}")
            if image.width * image.height > limits.max_pixels:
                raise ImageError("Image has too many pixels")
            image.load()
    except ImageError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ImageError("Unsupported or unsafe image file") from exc
    except (OSError, SyntaxError, ValueError) as exc:
        raise ImageError("Corrupt image file") from exc
    oriented: Image.Image = ImageOps.exif_transpose(image)  # honour camera orientation
    oriented.format = fmt
    return oriented


def encode(image: Image.Image, fmt: OutputFormat, quality: int = 85) -> bytes:
    """Encode to the requested format. Metadata (EXIF/GPS) is not copied to the output."""
    if fmt is OutputFormat.JPEG and image.mode not in ("RGB", "L"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.getchannel("A"))
        image = background
    elif image.mode not in ("RGB", "RGBA", "L", "LA"):
        image = image.convert("RGBA")
    buffer = io.BytesIO()
    if fmt is OutputFormat.PNG:
        image.save(buffer, format="PNG", optimize=True)
    else:
        image.save(buffer, format=fmt.value.upper(), quality=quality)
    return buffer.getvalue()


def describe(image: Image.Image, size_bytes: int) -> ImageInfo:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    mean = rgb.reshape(-1, 3).mean(axis=0)
    # Dominant colour: most common bucket after quantizing each channel to 8 levels.
    quantized = (rgb.reshape(-1, 3) // 32).astype(np.int64)
    keys = quantized[:, 0] * 64 + quantized[:, 1] * 8 + quantized[:, 2]
    dominant_key = int(np.bincount(keys).argmax())
    dominant = tuple(
        int(v * 32 + 16) for v in (dominant_key // 64, (dominant_key // 8) % 8, dominant_key % 8)
    )
    gray = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return ImageInfo(
        format=image.format or "unknown",
        mode=image.mode,
        width=image.width,
        height=image.height,
        size_bytes=size_bytes,
        has_alpha="A" in image.getbands(),
        mean_rgb=(round(mean[0], 2), round(mean[1], 2), round(mean[2], 2)),
        dominant_rgb=(dominant[0], dominant[1], dominant[2]),
        brightness=round(float(gray.mean()) / 255.0, 4),
        sharpness=round(sharpness, 2),
    )


def _check_dimensions(width: int, height: int, limits: ImageLimits) -> None:
    if width < 1 or height < 1:
        raise ImageError("Width and height must be positive")
    if max(width, height) > limits.max_output_dimension:
        raise ImageError(f"Output dimensions are limited to {limits.max_output_dimension}px")


def resize(
    image: Image.Image, width: int, height: int, limits: ImageLimits, *, keep_aspect: bool = True
) -> Image.Image:
    _check_dimensions(width, height, limits)
    if keep_aspect:
        copy = image.copy()
        copy.thumbnail((width, height), Image.Resampling.LANCZOS)
        # thumbnail never upscales; fall back to an aspect-preserving resize when enlarging
        if copy.width < width and copy.height < height:
            scale = min(width / image.width, height / image.height)
            size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
            return image.resize(size, Image.Resampling.LANCZOS)
        return copy
    return image.resize((width, height), Image.Resampling.LANCZOS)


def crop(image: Image.Image, x: int, y: int, width: int, height: int) -> Image.Image:
    if x < 0 or y < 0 or width < 1 or height < 1:
        raise ImageError("Crop box must be inside the image with positive size")
    if x + width > image.width or y + height > image.height:
        raise ImageError("Crop box exceeds image bounds")
    return image.crop((x, y, x + width, y + height))


def thumbnail(image: Image.Image, size: int) -> Image.Image:
    """Square, centre-cropped thumbnail."""
    if not 16 <= size <= 1024:
        raise ImageError("Thumbnail size must be between 16 and 1024")
    return ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS)


def apply_filter(image: Image.Image, kind: FilterType, intensity: float = 1.0) -> Image.Image:
    if not 0.0 < intensity <= 10.0:
        raise ImageError("Intensity must be in (0, 10]")
    rgb = image.convert("RGB")
    match kind:
        case FilterType.BLUR:
            return rgb.filter(ImageFilter.GaussianBlur(radius=2 * intensity))
        case FilterType.SHARPEN:
            return ImageEnhance.Sharpness(rgb).enhance(1.0 + intensity)
        case FilterType.GRAYSCALE:
            return ImageOps.grayscale(rgb)
        case FilterType.EDGES:
            gray = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2GRAY)
            low = int(min(255, 50 * intensity))
            edges = cv2.Canny(gray, low, min(255, low * 3))
            return Image.fromarray(edges)
        case FilterType.EMBOSS:
            return Image.blend(rgb, rgb.filter(ImageFilter.EMBOSS), min(intensity, 1.0))
        case FilterType.CONTOUR:
            return Image.blend(rgb, rgb.filter(ImageFilter.CONTOUR), min(intensity, 1.0))
        case FilterType.MEDIAN:
            kernel = max(3, int(intensity * 2) * 2 + 1)
            return Image.fromarray(cv2.medianBlur(np.asarray(rgb), kernel))
        case FilterType.SEPIA:
            matrix = np.array([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]])
            sepia = np.asarray(rgb, dtype=np.float64) @ matrix.T
            mixed = (1 - min(intensity, 1.0)) * np.asarray(rgb) + min(intensity, 1.0) * sepia
            return Image.fromarray(np.clip(mixed, 0, 255).astype(np.uint8))


def enhance(
    image: Image.Image,
    *,
    brightness: float = 1.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    sharpness: float = 1.0,
) -> Image.Image:
    for value in (brightness, contrast, saturation, sharpness):
        if not 0.0 <= value <= 5.0:
            raise ImageError("Enhancement factors must be between 0 and 5")
    out = image.convert("RGB")
    for enhancer, factor in (
        (ImageEnhance.Brightness, brightness),
        (ImageEnhance.Contrast, contrast),
        (ImageEnhance.Color, saturation),
        (ImageEnhance.Sharpness, sharpness),
    ):
        if factor != 1.0:
            out = enhancer(out).enhance(factor)
    return out
