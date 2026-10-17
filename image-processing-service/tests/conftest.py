from __future__ import annotations

import io
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from image_service.config import Settings
from image_service.main import create_app
from image_service.processing import ImageLimits

MakeImage = Callable[..., bytes]


def _make(
    width: int = 120,
    height: int = 80,
    color: tuple[int, ...] = (30, 90, 220),
    fmt: str = "PNG",
    mode: str = "RGB",
) -> bytes:
    image = Image.new(mode, (width, height), color)
    # add some structure so edge/sharpness metrics are non-trivial
    for x in range(0, width, 10):
        for y in range(height):
            image.putpixel((x, y), (255,) * len(image.getbands()))
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture
def make_image() -> MakeImage:
    return _make


@pytest.fixture
def limits() -> ImageLimits:
    return ImageLimits(
        max_bytes=2 * 1024 * 1024,
        max_pixels=4_000_000,
        allowed_formats=frozenset({"JPEG", "PNG", "WEBP", "GIF"}),
        max_output_dimension=4000,
    )


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        storage_dir=tmp_path / "images",
        max_upload_mb=1.0,
        max_pixels=4_000_000,
        vision_provider="fake",
        log_json=False,
        log_level="WARNING",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client
