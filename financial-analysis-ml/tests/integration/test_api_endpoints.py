"""Integration tests for API endpoints."""
import pytest
from httpx import AsyncClient
from fastapi import status

from src.api.main import app


class TestAuthEndpoints:
    """Test authentication endpoints."""
    
    @pytest.mark.asyncio
    async def test_register_user_success(self, sample_user_data):
        """Test successful user registration."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/auth/register", json=sample_user_data)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == sample_user_data["email"]
        assert data["first_name"] == sample_user_data["first_name"]
        assert data["last_name"] == sample_user_data["last_name"]
        assert data["is_active"] is True
        assert data["is_verified"] is False
    
    @pytest.mark.asyncio
    async def test_register_user_invalid_email(self, sample_user_data):
        """Test user registration with invalid email."""
        invalid_data = sample_user_data.copy()
        invalid_data["email"] = "invalid-email"
        
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/auth/register", json=invalid_data)
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    @pytest.mark.asyncio
    async def test_register_user_weak_password(self, sample_user_data):
        """Test user registration with weak password."""
        invalid_data = sample_user_data.copy()
        invalid_data["password"] = "weak"
        
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/auth/register", json=invalid_data)
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    @pytest.mark.asyncio
    async def test_login_success(self, sample_user_data):
        """Test successful user login."""
        # First register a user
        async with AsyncClient(app=app, base_url="http://test") as client:
            await client.post("/api/v1/auth/register", json=sample_user_data)
            
            # Then login
            login_data = {
                "email": sample_user_data["email"],
                "password": sample_user_data["password"],
            }
            response = await client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert "user" in data
    
    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self):
        """Test login with invalid credentials."""
        login_data = {
            "email": "nonexistent@example.com",
            "password": "wrongpassword",
        }
        
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    @pytest.mark.asyncio
    async def test_get_current_user_unauthorized(self):
        """Test getting current user without authentication."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/api/v1/auth/me")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    @pytest.mark.asyncio
    async def test_get_current_user_success(self, sample_user_data):
        """Test getting current user with valid token."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Register and login
            await client.post("/api/v1/auth/register", json=sample_user_data)
            login_response = await client.post("/api/v1/auth/login", json={
                "email": sample_user_data["email"],
                "password": sample_user_data["password"],
            })
            
            token = login_response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Get current user
            response = await client.get("/api/v1/auth/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == sample_user_data["email"]


class TestUserEndpoints:
    """Test user management endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_my_profile(self, sample_user_data):
        """Test getting user profile."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Register and login
            await client.post("/api/v1/auth/register", json=sample_user_data)
            login_response = await client.post("/api/v1/auth/login", json={
                "email": sample_user_data["email"],
                "password": sample_user_data["password"],
            })
            
            token = login_response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Get profile
            response = await client.get("/api/v1/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == sample_user_data["email"]
        assert data["first_name"] == sample_user_data["first_name"]
        assert data["last_name"] == sample_user_data["last_name"]
    
    @pytest.mark.asyncio
    async def test_update_my_profile(self, sample_user_data):
        """Test updating user profile."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Register and login
            await client.post("/api/v1/auth/register", json=sample_user_data)
            login_response = await client.post("/api/v1/auth/login", json={
                "email": sample_user_data["email"],
                "password": sample_user_data["password"],
            })
            
            token = login_response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Update profile
            update_data = {
                "first_name": "Jane",
                "last_name": "Smith",
            }
            response = await client.put("/api/v1/users/me", json=update_data, headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["first_name"] == "Jane"
        assert data["last_name"] == "Smith"
        assert data["email"] == sample_user_data["email"]  # Email should not change
    
    @pytest.mark.asyncio
    async def test_deactivate_my_account(self, sample_user_data):
        """Test deactivating user account."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Register and login
            await client.post("/api/v1/auth/register", json=sample_user_data)
            login_response = await client.post("/api/v1/auth/login", json={
                "email": sample_user_data["email"],
                "password": sample_user_data["password"],
            })
            
            token = login_response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Deactivate account
            response = await client.delete("/api/v1/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["message"] == "Account deactivated successfully"


class TestHealthEndpoints:
    """Test health check endpoints."""
    
    @pytest.mark.asyncio
    async def test_health_check(self):
        """Test health check endpoint."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/health")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "financial-analysis-ml"
        assert data["version"] == "1.0.0"
    
    @pytest.mark.asyncio
    async def test_root_endpoint(self):
        """Test root endpoint."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["message"] == "Financial Analysis ML API"
        assert data["version"] == "1.0.0"