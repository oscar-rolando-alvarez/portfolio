from __future__ import annotations

import base64
import io
import json
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image
from pydantic import SecretStr, ValidationError

from image_service import extras, processing
from image_service.config import Settings
from image_service.genai.vision import (
    FakeVisionAnalyzer,
    OpenAICompatibleVisionAnalyzer,
    VisionAnalyzer,
    VisionResult,
    VisionUnavailableError,
    build_vision_analyzer,
    color_name,
)

IMAGE = Image.new("RGB", (3000, 1000), (220, 40, 40))
INFO = processing.describe(IMAGE.resize((300, 100)), 1234)


class _StubCompletions:
    def __init__(self, content: str | None = None, fail: bool = False) -> None:
        self.content = content
        self.fail = fail
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.fail:
            raise ConnectionError("down")
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))]
        )


def _analyzer(stub: _StubCompletions) -> OpenAICompatibleVisionAnalyzer:
    client = SimpleNamespace(chat=SimpleNamespace(completions=stub))
    return OpenAICompatibleVisionAnalyzer(client, "vision-model", max_side=256)  # type: ignore[arg-type]


async def test_fake_analyzer_is_deterministic():
    analyzer = FakeVisionAnalyzer()

    first = await analyzer.analyze(IMAGE, INFO)

    assert first == await analyzer.analyze(IMAGE, INFO)
    assert "red" in first.tags
    assert "landscape" in first.caption
    assert isinstance(analyzer, VisionAnalyzer)


def test_color_names():
    assert color_name((250, 250, 250)) == "white"
    assert color_name((10, 200, 60)) == "green"


async def test_openai_analyzer_sends_downscaled_image_and_parses_json():
    payload = {
        "caption": "A red banner.",
        "tags": ["Red", "red", " banner "],
        "alt_text": "Red banner",
    }
    stub = _StubCompletions(json.dumps(payload))

    result = await _analyzer(stub).analyze(IMAGE, INFO)

    assert result.tags == ["red", "banner"]
    call = stub.calls[0]
    assert call["model"] == "vision-model"
    assert call["response_format"] == {"type": "json_object"}
    url = call["messages"][1]["content"][1]["image_url"]["url"]
    assert url.startswith("data:image/jpeg;base64,")
    sent = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
    assert max(sent.size) == 256


@pytest.mark.parametrize(
    "stub",
    [
        _StubCompletions(fail=True),
        _StubCompletions("not json"),
        _StubCompletions(json.dumps({"caption": "x"})),
        _StubCompletions(None),
    ],
)
async def test_openai_analyzer_errors_are_wrapped(stub: _StubCompletions):
    with pytest.raises(VisionUnavailableError):
        await _analyzer(stub).analyze(IMAGE, INFO)


def test_vision_result_rejects_blank_tags():
    with pytest.raises(ValidationError):
        VisionResult(caption="c", tags=["  "], alt_text="a")


def test_factory():
    assert build_vision_analyzer(Settings(vision_provider="disabled")) is None
    assert isinstance(build_vision_analyzer(Settings(vision_provider="fake")), FakeVisionAnalyzer)
    real = build_vision_analyzer(
        Settings(vision_provider="openai", llm_api_key=SecretStr("k"), llm_vision_model="llava")
    )
    assert isinstance(real, OpenAICompatibleVisionAnalyzer)
    assert real.model == "llava"


def test_optional_extras_report_unavailable(monkeypatch: pytest.MonkeyPatch):
    import builtins

    real_import = builtins.__import__

    def fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
        if name in {"pytesseract", "ultralytics"}:
            raise ImportError(name)
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    extras._yolo.cache_clear()
    with pytest.raises(extras.FeatureUnavailableError, match="OCR"):
        extras.extract_text(IMAGE)
    with pytest.raises(extras.FeatureUnavailableError, match="Object detection"):
        extras.detect_objects(IMAGE, "yolo11n.pt", 0.5)
