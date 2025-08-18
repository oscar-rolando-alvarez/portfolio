"""Pytest configuration and fixtures."""
import asyncio
import pytest
import pytest_asyncio
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.models import Base
from src.infrastructure.database.connection import DatabaseConfig
from src.infrastructure.cache.redis_cache import RedisCache
from src.application.services.auth_service import AuthService


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Create test database session."""
    # Use in-memory SQLite for tests
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        echo=False,
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session
    async_session_factory = sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session_factory() as session:
        yield session
    
    # Clean up
    await engine.dispose()


@pytest.fixture
def test_cache():
    """Create test cache instance."""
    # Use fake Redis for tests
    from fakeredis import aioredis
    
    class TestRedisCache(RedisCache):
        def __init__(self):
            self.redis_client = aioredis.FakeRedis(decode_responses=True)
            self.default_ttl = 3600
    
    return TestRedisCache()


@pytest.fixture
def auth_service():
    """Create auth service for tests."""
    return AuthService(
        secret_key="test-secret-key",
        access_token_expire_minutes=30,
    )


@pytest.fixture
def sample_user_data():
    """Sample user data for tests."""
    return {
        "email": "test@example.com",
        "password": "TestPassword123!",
        "first_name": "John",
        "last_name": "Doe",
    }


@pytest.fixture
def sample_instrument_data():
    """Sample financial instrument data for tests."""
    from src.domain.entities.financial_instrument import InstrumentType, Currency
    
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
def sample_price_data():
    """Sample price data for tests."""
    from decimal import Decimal
    from datetime import datetime
    
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
def sample_portfolio_data():
    """Sample portfolio data for tests."""
    from src.domain.entities.financial_instrument import Currency
    
    return {
        "name": "Test Portfolio",
        "description": "A test portfolio",
        "base_currency": Currency.USD,
    }