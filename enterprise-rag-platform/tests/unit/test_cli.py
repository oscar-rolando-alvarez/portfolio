from __future__ import annotations

import json

import jwt
import pytest
from typer.testing import CliRunner

from ragplatform.cli import app
from ragplatform.config import get_settings


@pytest.fixture(autouse=True)
def _offline_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RAG_DATABASE_URL", raising=False)
    get_settings.cache_clear()


def test_ask_demo_answers_offline() -> None:
    result = CliRunner().invoke(app, ["ask", "How many weeks of paid parental leave are offered?"])
    assert result.exit_code == 0, result.output
    body = json.loads(result.output[result.output.index("{") :])
    assert "16 weeks" in body["answer"]
    assert body["citations"]


def test_dev_token_contains_claims() -> None:
    result = CliRunner().invoke(app, ["dev-token", "--tenant", "t1", "--groups", "a,b"])
    assert result.exit_code == 0
    claims = jwt.decode(result.output.strip(), options={"verify_signature": False})
    assert claims["tid"] == "t1"
    assert claims["groups"] == ["a", "b"]


def test_create_api_key_requires_database() -> None:
    result = CliRunner().invoke(app, ["create-api-key", "t1", "bot"])
    assert result.exit_code == 2
