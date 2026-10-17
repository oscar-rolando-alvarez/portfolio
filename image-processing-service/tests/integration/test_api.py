from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from image_service.api.routes import get_vision
from image_service.genai.vision import VisionUnavailableError
from tests.conftest import MakeImage


def _files(
    data: bytes, name: str = "photo.png", ctype: str = "image/png"
) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (name, data, ctype)}


def test_health_and_metrics(client: TestClient):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["checks"]["storage"] == "ok"
    assert "http_requests_total" in client.get("/metrics").text


def test_info(client: TestClient, make_image: MakeImage):
    response = client.post("/api/v1/images/info", files=_files(make_image(64, 128)))

    assert response.status_code == 200
    body = response.json()
    assert (body["width"], body["height"], body["orientation"]) == (64, 128, "portrait")


def test_resize_returns_image(client: TestClient, make_image: MakeImage):
    response = client.post(
        "/api/v1/images/resize",
        files=_files(make_image(200, 100)),
        data={"width": "50", "height": "50", "output_format": "webp"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(response.content)).size == (50, 25)
    assert response.headers["x-image-width"] == "50"


@pytest.mark.parametrize(
    ("path", "data"),
    [
        ("/api/v1/images/crop", {"x": "0", "y": "0", "width": "20", "height": "10"}),
        ("/api/v1/images/thumbnail", {"size": "32"}),
        ("/api/v1/images/filter", {"filter_type": "edges", "output_format": "png"}),
        ("/api/v1/images/enhance", {"brightness": "1.3", "contrast": "1.1"}),
    ],
)
def test_transform_endpoints(
    client: TestClient, make_image: MakeImage, path: str, data: dict[str, str]
):
    response = client.post(path, files=_files(make_image()), data=data)

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("image/")
    Image.open(io.BytesIO(response.content)).verify()


def test_validation_errors(client: TestClient, make_image: MakeImage):
    bad_crop = client.post(
        "/api/v1/images/crop",
        files=_files(make_image(50, 50)),
        data={"x": "40", "y": "0", "width": "20", "height": "10"},
    )
    assert bad_crop.status_code == 422
    assert "exceeds" in bad_crop.json()["detail"]

    not_image = client.post("/api/v1/images/info", files=_files(b"hello", "x.txt", "text/plain"))
    assert not_image.status_code == 422

    bad_quality = client.post(
        "/api/v1/images/resize",
        files=_files(make_image()),
        data={"width": "10", "height": "10", "quality": "0"},
    )
    assert bad_quality.status_code == 422

    unknown_filter = client.post(
        "/api/v1/images/filter", files=_files(make_image()), data={"filter_type": "vaporwave"}
    )
    assert unknown_filter.status_code == 422


def test_upload_size_limit(client: TestClient):
    huge = b"\x89PNG" + b"0" * (1024 * 1024 + 10)

    response = client.post("/api/v1/images/info", files=_files(huge))

    assert response.status_code == 413


def test_analyze_with_fake_provider(client: TestClient, make_image: MakeImage):
    response = client.post(
        "/api/v1/images/analyze", files=_files(make_image(100, 100, (240, 220, 40)))
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "fake"
    assert "yellow" in body["vision"]["tags"]
    assert body["info"]["orientation"] == "square"


def test_analyze_disabled_and_failing_provider(client: TestClient, make_image: MakeImage):
    client.app.dependency_overrides[get_vision] = lambda: None  # type: ignore[attr-defined]
    assert client.post("/api/v1/images/analyze", files=_files(make_image())).status_code == 501

    class Failing:
        name = "failing"

        async def analyze(self, *args: object) -> None:
            raise VisionUnavailableError("Vision provider request failed")

    client.app.dependency_overrides[get_vision] = Failing  # type: ignore[attr-defined]
    response = client.post("/api/v1/images/analyze", files=_files(make_image()))
    assert response.status_code == 502


def test_store_and_fetch(client: TestClient, make_image: MakeImage):
    data = make_image()
    created = client.post("/api/v1/images", files=_files(data))

    assert created.status_code == 201
    body = created.json()
    fetched = client.get(body["url"])
    assert fetched.status_code == 200
    assert fetched.content == data
    assert fetched.headers["content-type"] == "image/png"
    assert client.get("/api/v1/images/" + "0" * 64 + ".png").status_code == 404


def test_optional_features_return_501_when_not_installed(client: TestClient, make_image: MakeImage):
    pytest.importorskip("PIL")
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        assert client.post("/api/v1/images/ocr", files=_files(make_image())).status_code == 501
    try:
        import ultralytics  # noqa: F401
    except ImportError:
        assert client.post("/api/v1/images/detect", files=_files(make_image())).status_code == 501
