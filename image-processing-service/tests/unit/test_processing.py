from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from image_service import processing
from image_service.processing import FilterType, ImageError, ImageLimits, OutputFormat
from image_service.storage import LocalStorage
from tests.conftest import MakeImage


def _decode(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def test_load_and_describe(make_image: MakeImage, limits: ImageLimits):
    data = make_image(120, 80, (30, 90, 220))
    image = processing.load_image(data, limits)
    info = processing.describe(image, len(data))

    assert (info.width, info.height, info.format) == (120, 80, "PNG")
    assert info.orientation == "landscape"
    assert info.dominant_rgb == (16, 80, 208)  # quantized blue bucket
    assert 0 < info.brightness < 1
    assert info.sharpness > 0
    assert not info.has_alpha


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"", "Empty upload"),
        (b"definitely not an image", "Unsupported or unsafe"),
    ],
)
def test_load_rejects_bad_input(data: bytes, message: str, limits: ImageLimits):
    with pytest.raises(ImageError, match=message):
        processing.load_image(data, limits)


def test_load_rejects_truncated_file(make_image: MakeImage, limits: ImageLimits):
    data = make_image(200, 200)

    with pytest.raises(ImageError, match="Corrupt"):
        processing.load_image(data[: len(data) // 2], limits)


def test_load_enforces_limits(make_image: MakeImage, limits: ImageLimits):
    with pytest.raises(ImageError, match="Unsupported format BMP"):
        processing.load_image(make_image(fmt="BMP"), limits)
    tiny = ImageLimits(max_bytes=100, max_pixels=10, allowed_formats=frozenset({"PNG"}))
    with pytest.raises(ImageError, match="MB limit"):
        processing.load_image(make_image(), tiny)
    few_pixels = ImageLimits(max_bytes=10**7, max_pixels=100, allowed_formats=frozenset({"PNG"}))
    with pytest.raises(ImageError, match="too many pixels"):
        processing.load_image(make_image(), few_pixels)


def test_exif_orientation_is_applied(limits: ImageLimits):
    image = Image.new("RGB", (40, 20), (200, 10, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif.tobytes())

    loaded = processing.load_image(buffer.getvalue(), limits)

    assert loaded.size == (20, 40)
    assert loaded.format == "JPEG"


@pytest.mark.parametrize("fmt", list(OutputFormat))
def test_encode_formats_and_alpha_flattening(fmt: OutputFormat):
    rgba = Image.new("RGBA", (10, 10), (255, 0, 0, 0))
    decoded = _decode(processing.encode(rgba, fmt))

    assert decoded.format == fmt.value.upper()
    if fmt is OutputFormat.JPEG:
        assert decoded.mode == "RGB"
        assert decoded.getpixel((5, 5))[0] > 240  # transparent pixels became white
    palette = Image.new("P", (4, 4))
    assert _decode(processing.encode(palette, fmt)).size == (4, 4)


def test_resize_variants(limits: ImageLimits):
    image = Image.new("RGB", (200, 100))

    assert processing.resize(image, 50, 50, limits).size == (50, 25)
    assert processing.resize(image, 400, 400, limits).size == (
        400,
        200,
    )  # aspect-preserving upscale
    assert processing.resize(image, 30, 70, limits, keep_aspect=False).size == (30, 70)
    with pytest.raises(ImageError):
        processing.resize(image, 0, 10, limits)
    with pytest.raises(ImageError, match="limited"):
        processing.resize(image, 5000, 10, limits)


def test_crop_and_thumbnail():
    image = Image.new("RGB", (100, 60))

    assert processing.crop(image, 10, 10, 50, 40).size == (50, 40)
    with pytest.raises(ImageError, match="exceeds"):
        processing.crop(image, 80, 0, 50, 10)
    with pytest.raises(ImageError):
        processing.crop(image, -1, 0, 5, 5)
    assert processing.thumbnail(image, 32).size == (32, 32)
    with pytest.raises(ImageError):
        processing.thumbnail(image, 4)


@pytest.mark.parametrize("kind", list(FilterType))
def test_filters_produce_same_size(kind: FilterType, make_image: MakeImage, limits: ImageLimits):
    image = processing.load_image(make_image(64, 48), limits)

    out = processing.apply_filter(image, kind, 1.0)

    assert out.size == (64, 48)


def test_filter_intensity_validation():
    with pytest.raises(ImageError):
        processing.apply_filter(Image.new("RGB", (4, 4)), FilterType.BLUR, 0)


def test_enhance():
    dark = Image.new("RGB", (10, 10), (50, 50, 50))

    brighter = processing.enhance(dark, brightness=2.0, contrast=1.2, saturation=1.1, sharpness=1.5)

    assert brighter.getpixel((0, 0))[0] > 50
    with pytest.raises(ImageError):
        processing.enhance(dark, brightness=9)


async def test_local_storage_roundtrip(tmp_path: Path):
    storage = LocalStorage(tmp_path / "store")

    key = await storage.put(b"abc", "PNG")
    again = await storage.put(b"abc", "png")

    assert key == again
    assert key.endswith(".png")
    assert await storage.get(key) == b"abc"
    assert await storage.get("../../etc/passwd") is None
    assert await storage.get("0" * 64 + ".png") is None
    assert await storage.healthy()


async def test_local_storage_unhealthy_when_root_is_a_file(tmp_path: Path):
    blocker = tmp_path / "file"
    blocker.write_text("x")

    assert not await LocalStorage(blocker).healthy()
