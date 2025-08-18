"""Unit tests for caching system."""
import pytest
import uuid
from unittest.mock import AsyncMock, Mock, patch

from app.cache.cache_manager import CacheManager, cache_result


class TestCacheManager:
    """Test cache manager functionality."""
    
    @pytest.fixture
    def cache_manager(self):
        return CacheManager()
    
    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client."""
        mock = AsyncMock()
        mock.get.return_value = None
        mock.set.return_value = True
        mock.delete.return_value = True
        return mock
    
    def test_generate_cache_key(self, cache_manager):
        """Test cache key generation."""
        key = cache_manager._generate_cache_key("test", "arg1", "arg2", param1="value1")
        
        assert "test" in key
        assert "arg1" in key
        assert "arg2" in key
        assert "param1:value1" in key
    
    def test_generate_cache_key_with_long_string(self, cache_manager):
        """Test cache key generation with long string that gets hashed."""
        long_args = ["very_long_argument"] * 20
        key = cache_manager._generate_cache_key("test", *long_args)
        
        # Should be hashed and contain hash prefix
        assert "hash:" in key
        assert len(key) < 250  # Should be shorter than original
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_get_recommendations(self, mock_redis, cache_manager):
        """Test getting recommendations from cache."""
        user_id = uuid.uuid4()
        algorithm = "collaborative"
        num_items = 10
        
        mock_redis.get.return_value = [
            {"item_id": "item1", "score": 0.9},
            {"item_id": "item2", "score": 0.8}
        ]
        
        result = await cache_manager.get_recommendations(user_id, algorithm, num_items)
        
        assert result is not None
        assert len(result) == 2
        mock_redis.get.assert_called_once()
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_set_recommendations(self, mock_redis, cache_manager):
        """Test setting recommendations in cache."""
        user_id = uuid.uuid4()
        algorithm = "collaborative"
        recommendations = [
            {"item_id": "item1", "score": 0.9},
            {"item_id": "item2", "score": 0.8}
        ]
        
        mock_redis.set.return_value = True
        
        result = await cache_manager.set_recommendations(
            user_id, algorithm, recommendations
        )
        
        assert result is True
        mock_redis.set.assert_called_once()
        
        # Check that TTL was set
        call_args = mock_redis.set.call_args
        assert call_args[1]['expire'] == cache_manager.recommendation_ttl
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_get_user_data(self, mock_redis, cache_manager):
        """Test getting user data from cache."""
        user_id = uuid.uuid4()
        user_data = {"id": str(user_id), "email": "test@example.com"}
        
        mock_redis.get.return_value = user_data
        
        result = await cache_manager.get_user_data(user_id)
        
        assert result == user_data
        mock_redis.get.assert_called_once_with(f"user:{user_id}")
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_set_user_data(self, mock_redis, cache_manager):
        """Test setting user data in cache."""
        user_id = uuid.uuid4()
        user_data = {"id": str(user_id), "email": "test@example.com"}
        
        mock_redis.set.return_value = True
        
        result = await cache_manager.set_user_data(user_id, user_data)
        
        assert result is True
        mock_redis.set.assert_called_once()
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_get_item_data(self, mock_redis, cache_manager):
        """Test getting item data from cache."""
        item_id = uuid.uuid4()
        item_data = {"id": str(item_id), "title": "Test Item"}
        
        mock_redis.get.return_value = item_data
        
        result = await cache_manager.get_item_data(item_id)
        
        assert result == item_data
        mock_redis.get.assert_called_once_with(f"item:{item_id}")
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_get_similarity_matrix(self, mock_redis, cache_manager):
        """Test getting similarity matrix from cache."""
        matrix_data = {
            "matrix": [[1.0, 0.5], [0.5, 1.0]],
            "user_mapping": {"user1": 0, "user2": 1}
        }
        
        mock_redis.get.return_value = matrix_data
        
        result = await cache_manager.get_similarity_matrix("user", "cosine")
        
        assert result == matrix_data
        mock_redis.get.assert_called_once_with("similarity:user:cosine")
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_set_similarity_matrix(self, mock_redis, cache_manager):
        """Test setting similarity matrix in cache."""
        matrix_data = {
            "matrix": [[1.0, 0.5], [0.5, 1.0]],
            "user_mapping": {"user1": 0, "user2": 1}
        }
        
        mock_redis.set.return_value = True
        
        result = await cache_manager.set_similarity_matrix("user", "cosine", matrix_data)
        
        assert result is True
        mock_redis.set.assert_called_once()
        
        # Check that extended TTL was set (24 hours)
        call_args = mock_redis.set.call_args
        assert call_args[1]['expire'] == 86400
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_invalidate_user_cache(self, mock_redis, cache_manager):
        """Test invalidating user cache."""
        user_id = uuid.uuid4()
        
        mock_redis.delete.return_value = True
        
        await cache_manager.invalidate_user_cache(user_id)
        
        # Should call delete for user-specific keys
        mock_redis.delete.assert_called()
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_get_popular_items(self, mock_redis, cache_manager):
        """Test getting popular items from cache."""
        tenant_id = uuid.uuid4()
        category = "action"
        limit = 10
        
        popular_items = [
            {"id": "item1", "title": "Popular Item 1"},
            {"id": "item2", "title": "Popular Item 2"}
        ]
        
        mock_redis.get.return_value = popular_items
        
        result = await cache_manager.get_popular_items(tenant_id, category, limit)
        
        assert result == popular_items
        mock_redis.get.assert_called_once()
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_set_popular_items(self, mock_redis, cache_manager):
        """Test setting popular items in cache."""
        tenant_id = uuid.uuid4()
        category = "action"
        items = [
            {"id": "item1", "title": "Popular Item 1"},
            {"id": "item2", "title": "Popular Item 2"}
        ]
        
        mock_redis.set.return_value = True
        
        result = await cache_manager.set_popular_items(tenant_id, items, category)
        
        assert result is True
        mock_redis.set.assert_called_once()


class TestCacheResultDecorator:
    """Test cache result decorator."""
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_cache_result_decorator_miss(self, mock_redis):
        """Test cache decorator with cache miss."""
        mock_redis.get.return_value = None
        mock_redis.set.return_value = True
        
        @cache_result("test_func", ttl=3600)
        async def test_function(arg1, arg2):
            return f"result_{arg1}_{arg2}"
        
        result = await test_function("a", "b")
        
        assert result == "result_a_b"
        mock_redis.get.assert_called_once()
        mock_redis.set.assert_called_once()
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_cache_result_decorator_hit(self, mock_redis):
        """Test cache decorator with cache hit."""
        cached_result = "cached_result"
        mock_redis.get.return_value = cached_result
        
        @cache_result("test_func", ttl=3600)
        async def test_function(arg1, arg2):
            return f"result_{arg1}_{arg2}"
        
        result = await test_function("a", "b")
        
        assert result == cached_result
        mock_redis.get.assert_called_once()
        mock_redis.set.assert_not_called()  # Should not set if cache hit
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_cache_result_decorator_with_custom_key_func(self, mock_redis):
        """Test cache decorator with custom key function."""
        mock_redis.get.return_value = None
        mock_redis.set.return_value = True
        
        def custom_key_func(arg1, arg2):
            return f"custom_key_{arg1}_{arg2}"
        
        @cache_result("test_func", ttl=3600, key_func=custom_key_func)
        async def test_function(arg1, arg2):
            return f"result_{arg1}_{arg2}"
        
        result = await test_function("a", "b")
        
        assert result == "result_a_b"
        mock_redis.get.assert_called_once()
        
        # Check that custom key function was used
        call_args = mock_redis.get.call_args
        assert call_args[0][0] == "custom_key_a_b"
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_cache_result_decorator_none_result(self, mock_redis):
        """Test cache decorator with None result (should not cache)."""
        mock_redis.get.return_value = None
        
        @cache_result("test_func", ttl=3600)
        async def test_function():
            return None
        
        result = await test_function()
        
        assert result is None
        mock_redis.get.assert_called_once()
        mock_redis.set.assert_not_called()  # Should not cache None results


class TestCacheManagerErrorHandling:
    """Test cache manager error handling."""
    
    @pytest.fixture
    def cache_manager(self):
        return CacheManager()
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_get_recommendations_redis_error(self, mock_redis, cache_manager):
        """Test getting recommendations when Redis throws an error."""
        user_id = uuid.uuid4()
        
        mock_redis.get.side_effect = Exception("Redis connection error")
        
        result = await cache_manager.get_recommendations(user_id, "test", 10)
        
        # Should return None on error, not raise exception
        assert result is None
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_set_recommendations_redis_error(self, mock_redis, cache_manager):
        """Test setting recommendations when Redis throws an error."""
        user_id = uuid.uuid4()
        
        mock_redis.set.side_effect = Exception("Redis connection error")
        
        result = await cache_manager.set_recommendations(user_id, "test", [], 10)
        
        # Should return False on error, not raise exception
        assert result is False
    
    @patch('app.cache.cache_manager.redis_client')
    async def test_cache_operations_with_disconnected_redis(self, mock_redis, cache_manager):
        """Test cache operations when Redis is disconnected."""
        mock_redis._connected = False
        
        # All operations should handle disconnected Redis gracefully
        result1 = await cache_manager.get_user_data(uuid.uuid4())
        result2 = await cache_manager.set_user_data(uuid.uuid4(), {})
        result3 = await cache_manager.get_recommendations(uuid.uuid4(), "test", 10)
        
        assert result1 is None
        assert result2 is False  
        assert result3 is None