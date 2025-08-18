"""Unit tests for authentication system."""
import pytest
import uuid
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from app.auth import jwt_handler, AuthContext, require_auth, check_subscription_tier
from app.auth.jwt_handler import JWTHandler


class TestJWTHandler:
    """Test JWT token handling."""
    
    def test_password_hashing(self):
        """Test password hashing and verification."""
        password = "test_password_123"
        
        # Hash password
        hashed = jwt_handler.hash_password(password)
        
        assert hashed != password
        assert jwt_handler.verify_password(password, hashed)
        assert not jwt_handler.verify_password("wrong_password", hashed)
    
    def test_access_token_creation(self):
        """Test access token creation."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        email = "test@example.com"
        subscription_tier = "premium"
        
        token = jwt_handler.create_access_token(
            user_id, tenant_id, email, subscription_tier
        )
        
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_refresh_token_creation(self):
        """Test refresh token creation."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        
        token = jwt_handler.create_refresh_token(user_id, tenant_id)
        
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_token_verification(self):
        """Test token verification."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        email = "test@example.com"
        subscription_tier = "premium"
        
        # Create token
        token = jwt_handler.create_access_token(
            user_id, tenant_id, email, subscription_tier
        )
        
        # Verify token
        payload = jwt_handler.verify_token(token)
        
        assert payload is not None
        assert payload["sub"] == str(user_id)
        assert payload["tenant_id"] == str(tenant_id)
        assert payload["email"] == email
        assert payload["subscription_tier"] == subscription_tier
        assert payload["type"] == "access"
    
    def test_invalid_token_verification(self):
        """Test verification of invalid token."""
        invalid_token = "invalid.token.here"
        
        payload = jwt_handler.verify_token(invalid_token)
        
        assert payload is None
    
    def test_expired_token_verification(self):
        """Test verification of expired token."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        email = "test@example.com"
        
        # Create token with immediate expiration
        token = jwt_handler.create_access_token(
            user_id, tenant_id, email, "basic",
            expires_delta=timedelta(seconds=-1)  # Already expired
        )
        
        payload = jwt_handler.verify_token(token)
        
        assert payload is None
    
    def test_get_user_from_token(self):
        """Test extracting user info from token."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        email = "test@example.com"
        subscription_tier = "premium"
        
        token = jwt_handler.create_access_token(
            user_id, tenant_id, email, subscription_tier
        )
        
        user_info = jwt_handler.get_user_from_token(token)
        
        assert user_info is not None
        assert user_info["user_id"] == user_id
        assert user_info["tenant_id"] == tenant_id
        assert user_info["email"] == email
        assert user_info["subscription_tier"] == subscription_tier
    
    def test_get_user_from_refresh_token(self):
        """Test that refresh tokens don't return user info."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        
        refresh_token = jwt_handler.create_refresh_token(user_id, tenant_id)
        
        user_info = jwt_handler.get_user_from_token(refresh_token)
        
        assert user_info is None  # Should only work with access tokens


class TestAuthContext:
    """Test authentication context."""
    
    def test_context_creation(self):
        """Test context creation."""
        context = AuthContext()
        
        assert context.user is None
        assert context.tenant_id is None
        assert context.subscription_tier == "basic"
        assert not context.is_authenticated
        assert context.user_id is None
    
    def test_context_with_user(self):
        """Test context with authenticated user."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        
        context = AuthContext()
        context.user = {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "email": "test@example.com",
            "subscription_tier": "premium"
        }
        context.tenant_id = tenant_id
        context.subscription_tier = "premium"
        
        assert context.is_authenticated
        assert context.user_id == user_id


class TestAuthDecorators:
    """Test authentication decorators."""
    
    def test_require_auth_decorator_with_authenticated_user(self):
        """Test require_auth decorator with authenticated user."""
        # Mock info object
        mock_info = Mock()
        mock_context = Mock()
        mock_context.is_authenticated = True
        mock_info.context = mock_context
        
        @require_auth
        def test_function(info):
            return "success"
        
        result = test_function(mock_info)
        assert result == "success"
    
    def test_require_auth_decorator_with_unauthenticated_user(self):
        """Test require_auth decorator with unauthenticated user."""
        from fastapi import HTTPException
        
        # Mock info object
        mock_info = Mock()
        mock_context = Mock()
        mock_context.is_authenticated = False
        mock_info.context = mock_context
        
        @require_auth
        def test_function(info):
            return "success"
        
        with pytest.raises(HTTPException) as exc_info:
            test_function(mock_info)
        
        assert exc_info.value.status_code == 401
    
    def test_subscription_tier_decorator_sufficient_tier(self):
        """Test subscription tier decorator with sufficient tier."""
        # Mock info object
        mock_info = Mock()
        mock_context = Mock()
        mock_context.subscription_tier = "premium"
        mock_info.context = mock_context
        
        @check_subscription_tier("basic")
        def test_function(info):
            return "success"
        
        result = test_function(mock_info)
        assert result == "success"
    
    def test_subscription_tier_decorator_insufficient_tier(self):
        """Test subscription tier decorator with insufficient tier."""
        from fastapi import HTTPException
        
        # Mock info object
        mock_info = Mock()
        mock_context = Mock()
        mock_context.subscription_tier = "basic"
        mock_info.context = mock_context
        
        @check_subscription_tier("premium")
        def test_function(info):
            return "success"
        
        with pytest.raises(HTTPException) as exc_info:
            test_function(mock_info)
        
        assert exc_info.value.status_code == 403


class TestJWTHandlerConfiguration:
    """Test JWT handler configuration."""
    
    def test_custom_jwt_handler(self):
        """Test creating JWT handler with custom configuration."""
        custom_handler = JWTHandler()
        custom_handler.secret_key = "custom-secret-key"
        custom_handler.algorithm = "HS256"
        custom_handler.access_token_expire_minutes = 60
        custom_handler.refresh_token_expire_days = 14
        
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        email = "test@example.com"
        
        token = custom_handler.create_access_token(
            user_id, tenant_id, email, "basic"
        )
        
        payload = custom_handler.verify_token(token)
        
        assert payload is not None
        assert payload["sub"] == str(user_id)
    
    def test_token_expiration_times(self):
        """Test token expiration configuration."""
        handler = JWTHandler()
        handler.access_token_expire_minutes = 1  # 1 minute
        handler.refresh_token_expire_days = 1   # 1 day
        
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        
        # Create tokens
        access_token = handler.create_access_token(
            user_id, tenant_id, "test@example.com", "basic"
        )
        refresh_token = handler.create_refresh_token(user_id, tenant_id)
        
        # Verify tokens
        access_payload = handler.verify_token(access_token)
        refresh_payload = handler.verify_token(refresh_token)
        
        assert access_payload is not None
        assert refresh_payload is not None
        
        # Check expiration times
        access_exp = datetime.fromtimestamp(access_payload["exp"])
        refresh_exp = datetime.fromtimestamp(refresh_payload["exp"])
        
        now = datetime.utcnow()
        
        # Access token should expire in about 1 minute
        assert access_exp - now < timedelta(minutes=2)
        
        # Refresh token should expire in about 1 day
        assert refresh_exp - now < timedelta(days=2)
        assert refresh_exp - now > timedelta(hours=20)