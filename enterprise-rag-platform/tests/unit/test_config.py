from __future__ import annotations

import pytest
from pydantic import ValidationError

from tests.conftest import make_settings


def test_database_url_from_parts_is_escaped() -> None:
    s = make_settings(
        db_host="db.internal", db_user="app", db_password="p@ss/w:rd", db_ssl="require"
    )
    assert s.resolved_database_url == (
        "postgresql+asyncpg://app:p%40ss%2Fw%3Ard@db.internal:5432/rag?ssl=require"
    )


def test_explicit_url_wins() -> None:
    s = make_settings(database_url="postgresql+asyncpg://a:b@h/d", db_host="ignored")
    assert s.resolved_database_url == "postgresql+asyncpg://a:b@h/d"
    assert make_settings().resolved_database_url is None


def test_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValidationError):
        make_settings(jwt_secret="short")


def test_cors_csv_and_pricing() -> None:
    s = make_settings(cors_origins="https://a.example, https://b.example")
    assert s.cors_origins == ["https://a.example", "https://b.example"]
    assert s.price_for("unknown-model") == {"input": 0.0, "output": 0.0}
