"""Shared pytest fixtures."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from financial_analysis.api.main import create_app
from financial_analysis.application.services.auth_service import AuthService
from financial_analysis.config import Settings
from financial_analysis.domain.entities.financial_instrument import Currency, InstrumentType
from financial_analysis.infrastructure.database.models import Base


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'test.db'}",
        jwt_secret_key=SecretStr("test-secret-key-with-at-least-32-bytes!"),
        llm_provider="fake",
        log_json=False,
        log_level="WARNING",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest_asyncio.fixture
async def test_db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def auth_service() -> AuthService:
    return AuthService(secret_key="test-secret-key-with-at-least-32-bytes!")


@pytest.fixture
def sample_user_data() -> dict[str, str]:
    return {
        "email": "test@example.com",
        "password": "TestPassword123!",
        "first_name": "John",
        "last_name": "Doe",
    }


@pytest.fixture
def sample_instrument_data() -> dict[str, Any]:
    return {
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "instrument_type": InstrumentType.STOCK,
        "currency": Currency.USD,
        "exchange": "NASDAQ",
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "description": "Apple Inc. designs, manufactures, and markets smartphones.",
    }


@pytest.fixture
def sample_price_data() -> dict[str, Any]:
    return {
        "timestamp": datetime(2024, 1, 1, 9, 30),
        "open_price": Decimal("150.00"),
        "high_price": Decimal("155.00"),
        "low_price": Decimal("149.00"),
        "close_price": Decimal("154.50"),
        "volume": 1000000,
        "adjusted_close": Decimal("154.50"),
    }


@pytest.fixture
def sample_portfolio_data() -> dict[str, Any]:
    return {
        "name": "Test Portfolio",
        "description": "A test portfolio",
        "base_currency": Currency.USD,
    }
