"""Test configuration and fixtures."""
import asyncio
import pytest
import pytest_asyncio
from typing import AsyncGenerator, Dict, Any
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.config import settings
from app.database import get_async_session, db_manager
from app.models import Base, User, Item, Tenant, Interaction, Rating
from app.auth import jwt_handler
from app.cache import redis_client
from app.utils import vector_db_manager


# Test database URL
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        pool_pre_ping=True
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest_asyncio.fixture
async def test_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create test database session."""
    session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def test_client(test_session) -> AsyncGenerator[AsyncClient, None]:
    """Create test HTTP client."""
    
    # Override database dependency
    async def override_get_session():
        yield test_session
    
    app.dependency_overrides[get_async_session] = override_get_session
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_tenant(test_session) -> Tenant:
    """Create test tenant."""
    tenant = Tenant(
        name="Test Tenant",
        domain="test.example.com",
        is_active=True,
        settings={},
        subscription_tier="premium"
    )
    
    test_session.add(tenant)
    await test_session.commit()
    await test_session.refresh(tenant)
    
    return tenant


@pytest_asyncio.fixture
async def test_user(test_session, test_tenant) -> User:
    """Create test user."""
    password_hash = jwt_handler.hash_password("testpassword")
    
    user = User(
        tenant_id=test_tenant.id,
        email="test@example.com",
        username="testuser",
        password_hash=password_hash,
        is_active=True,
        is_verified=True,
        preferences={},
        profile_data={}
    )
    
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    
    return user


@pytest_asyncio.fixture
async def test_items(test_session, test_tenant) -> list[Item]:
    """Create test items."""
    items = []
    
    for i in range(10):
        item = Item(
            tenant_id=test_tenant.id,
            title=f"Test Item {i+1}",
            description=f"Description for test item {i+1}",
            category="test_category" if i < 5 else "other_category",
            tags=[f"tag{i}", "common_tag"],
            metadata={"test": True, "index": i},
            content_features={"feature1": i * 0.1, "feature2": (i + 1) * 0.2},
            is_active=True,
            popularity_score=float(i)
        )
        
        items.append(item)
        test_session.add(item)
    
    await test_session.commit()
    
    for item in items:
        await test_session.refresh(item)
    
    return items


@pytest_asyncio.fixture
async def test_interactions(test_session, test_user, test_items) -> list[Interaction]:
    """Create test interactions."""
    interactions = []
    
    # Create interactions for first 5 items
    for i, item in enumerate(test_items[:5]):
        interaction = Interaction(
            tenant_id=test_user.tenant_id,
            user_id=test_user.id,
            item_id=item.id,
            interaction_type="view" if i % 2 == 0 else "click",
            interaction_value=1.0 + (i * 0.1),
            session_id="test_session",
            context={"test": True}
        )
        
        interactions.append(interaction)
        test_session.add(interaction)
    
    await test_session.commit()
    
    for interaction in interactions:
        await test_session.refresh(interaction)
    
    return interactions


@pytest_asyncio.fixture
async def test_ratings(test_session, test_user, test_items) -> list[Rating]:
    """Create test ratings."""
    ratings = []
    
    # Create ratings for first 3 items
    for i, item in enumerate(test_items[:3]):
        rating = Rating(
            tenant_id=test_user.tenant_id,
            user_id=test_user.id,
            item_id=item.id,
            rating=3.0 + i,  # Ratings 3.0, 4.0, 5.0
            review=f"Test review for item {i+1}"
        )
        
        ratings.append(rating)
        test_session.add(rating)
    
    await test_session.commit()
    
    for rating in ratings:
        await test_session.refresh(rating)
    
    return ratings


@pytest.fixture
def auth_headers(test_user, test_tenant) -> Dict[str, str]:
    """Create authentication headers."""
    access_token = jwt_handler.create_access_token(
        test_user.id,
        test_tenant.id,
        test_user.email,
        test_tenant.subscription_tier
    )
    
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def sample_graphql_query() -> str:
    """Sample GraphQL query for testing."""
    return """
    query {
        me {
            id
            email
            username
            tenant {
                name
                domain
            }
        }
    }
    """


@pytest.fixture
def sample_recommendation_query() -> str:
    """Sample recommendation GraphQL query."""
    return """
    query GetRecommendations($options: RecommendationOptions) {
        recommendations(options: $options) {
            items {
                item {
                    id
                    title
                    category
                }
                score
                reason
            }
            algorithm
            responseTimeMs
            totalCount
        }
    }
    """


@pytest.fixture
def sample_mutation() -> str:
    """Sample GraphQL mutation."""
    return """
    mutation RecordInteraction($input: InteractionInput!) {
        recordInteraction(input: $input) {
            id
            interactionType
            interactionValue
            item {
                id
                title
            }
        }
    }
    """


@pytest_asyncio.fixture
async def mock_redis():
    """Mock Redis client for testing."""
    class MockRedis:
        def __init__(self):
            self.data = {}
            self._connected = True
        
        async def connect(self):
            self._connected = True
        
        async def disconnect(self):
            self._connected = False
        
        async def get(self, key):
            return self.data.get(key)
        
        async def set(self, key, value, expire=None):
            self.data[key] = value
            return True
        
        async def delete(self, key):
            return self.data.pop(key, None) is not None
        
        async def exists(self, key):
            return key in self.data
    
    return MockRedis()


@pytest_asyncio.fixture
async def mock_vector_db():
    """Mock vector database for testing."""
    class MockVectorDB:
        def __init__(self):
            self.vectors = {}
            self._connected = True
        
        async def connect(self):
            self._connected = True
        
        async def disconnect(self):
            self._connected = False
        
        async def store_item_vectors(self, items, collection="items"):
            for item in items:
                self.vectors[str(item['id'])] = item
        
        async def find_similar_items(self, query_vector, top_k=10, **kwargs):
            # Simple mock similarity (random)
            import random
            items = list(self.vectors.values())
            random.shuffle(items)
            return items[:top_k]
    
    return MockVectorDB()


@pytest.fixture
def recommendation_test_data():
    """Test data for recommendation engine testing."""
    return {
        "interactions": [
            {"user_id": "user1", "item_id": "item1", "rating": 5.0},
            {"user_id": "user1", "item_id": "item2", "rating": 4.0},
            {"user_id": "user1", "item_id": "item3", "rating": 3.0},
            {"user_id": "user2", "item_id": "item1", "rating": 4.0},
            {"user_id": "user2", "item_id": "item2", "rating": 5.0},
            {"user_id": "user2", "item_id": "item4", "rating": 3.0},
            {"user_id": "user3", "item_id": "item3", "rating": 5.0},
            {"user_id": "user3", "item_id": "item4", "rating": 4.0},
            {"user_id": "user3", "item_id": "item5", "rating": 3.0},
        ],
        "items": [
            {
                "id": "item1",
                "title": "Action Movie 1",
                "category": "action",
                "tags": ["action", "thriller"],
                "content_features": {"violence": 0.8, "humor": 0.2}
            },
            {
                "id": "item2", 
                "title": "Action Movie 2",
                "category": "action",
                "tags": ["action", "adventure"],
                "content_features": {"violence": 0.7, "humor": 0.3}
            },
            {
                "id": "item3",
                "title": "Comedy Movie 1",
                "category": "comedy",
                "tags": ["comedy", "romance"],
                "content_features": {"violence": 0.1, "humor": 0.9}
            },
            {
                "id": "item4",
                "title": "Comedy Movie 2", 
                "category": "comedy",
                "tags": ["comedy", "family"],
                "content_features": {"violence": 0.0, "humor": 0.8}
            },
            {
                "id": "item5",
                "title": "Drama Movie 1",
                "category": "drama",
                "tags": ["drama", "romance"],
                "content_features": {"violence": 0.3, "humor": 0.4}
            }
        ]
    }


# Async test markers
pytestmark = pytest.mark.asyncio