"""Unit tests for use cases."""
import pytest
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

from src.application.use_cases.user_use_cases import UserUseCases
from src.application.dto.user_dto import CreateUserRequest, UserLoginRequest, UpdateUserRequest
from src.domain.entities.user import User
from src.domain.exceptions.user_exceptions import (
    UserAlreadyExistsException,
    InvalidCredentialsException,
    UserNotFoundException,
)


class TestUserUseCases:
    """Test UserUseCases."""
    
    @pytest.fixture
    def mock_user_repository(self):
        """Create mock user repository."""
        return AsyncMock()
    
    @pytest.fixture
    def mock_auth_service(self):
        """Create mock auth service."""
        mock = Mock()
        mock.create_access_token.return_value = "test-token"
        mock.token_expires_in = 1800
        return mock
    
    @pytest.fixture
    def user_use_cases(self, mock_user_repository, mock_auth_service):
        """Create UserUseCases instance."""
        return UserUseCases(mock_user_repository, mock_auth_service)
    
    async def test_create_user_success(self, user_use_cases, mock_user_repository, sample_user_data):
        """Test successful user creation."""
        # Setup
        mock_user_repository.exists_by_email.return_value = False
        created_user = User.create(**sample_user_data)
        mock_user_repository.create.return_value = created_user
        
        request = CreateUserRequest(**sample_user_data)
        
        # Execute
        result = await user_use_cases.create_user(request)
        
        # Assert
        assert result.email == sample_user_data["email"]
        assert result.first_name == sample_user_data["first_name"]
        assert result.last_name == sample_user_data["last_name"]
        assert result.is_active is True
        assert result.is_verified is False
        
        mock_user_repository.exists_by_email.assert_called_once_with(sample_user_data["email"])
        mock_user_repository.create.assert_called_once()
    
    async def test_create_user_already_exists(self, user_use_cases, mock_user_repository, sample_user_data):
        """Test user creation when user already exists."""
        # Setup
        mock_user_repository.exists_by_email.return_value = True
        
        request = CreateUserRequest(**sample_user_data)
        
        # Execute & Assert
        with pytest.raises(UserAlreadyExistsException):
            await user_use_cases.create_user(request)
        
        mock_user_repository.exists_by_email.assert_called_once_with(sample_user_data["email"])
        mock_user_repository.create.assert_not_called()
    
    async def test_authenticate_user_success(
        self, 
        user_use_cases, 
        mock_user_repository, 
        mock_auth_service,
        sample_user_data
    ):
        """Test successful user authentication."""
        # Setup
        user = User.create(**sample_user_data)
        mock_user_repository.get_by_email.return_value = user
        
        request = UserLoginRequest(
            email=sample_user_data["email"],
            password=sample_user_data["password"],
        )
        
        # Execute
        result = await user_use_cases.authenticate_user(request)
        
        # Assert
        assert result.access_token == "test-token"
        assert result.token_type == "bearer"
        assert result.expires_in == 1800
        assert result.user.email == sample_user_data["email"]
        
        mock_user_repository.get_by_email.assert_called_once_with(sample_user_data["email"])
        mock_auth_service.create_access_token.assert_called_once()
    
    async def test_authenticate_user_not_found(
        self, 
        user_use_cases, 
        mock_user_repository,
        sample_user_data
    ):
        """Test authentication with non-existent user."""
        # Setup
        mock_user_repository.get_by_email.return_value = None
        
        request = UserLoginRequest(
            email=sample_user_data["email"],
            password=sample_user_data["password"],
        )
        
        # Execute & Assert
        with pytest.raises(InvalidCredentialsException):
            await user_use_cases.authenticate_user(request)
    
    async def test_authenticate_user_wrong_password(
        self, 
        user_use_cases, 
        mock_user_repository,
        sample_user_data
    ):
        """Test authentication with wrong password."""
        # Setup
        user = User.create(**sample_user_data)
        mock_user_repository.get_by_email.return_value = user
        
        request = UserLoginRequest(
            email=sample_user_data["email"],
            password="WrongPassword123!",
        )
        
        # Execute & Assert
        with pytest.raises(InvalidCredentialsException):
            await user_use_cases.authenticate_user(request)
    
    async def test_get_user_success(self, user_use_cases, mock_user_repository, sample_user_data):
        """Test successful user retrieval."""
        # Setup
        user_id = uuid4()
        user = User.create(**sample_user_data)
        user.id = user_id
        mock_user_repository.get_by_id.return_value = user
        
        # Execute
        result = await user_use_cases.get_user(user_id)
        
        # Assert
        assert result.id == user_id
        assert result.email == sample_user_data["email"]
        
        mock_user_repository.get_by_id.assert_called_once_with(user_id)
    
    async def test_get_user_not_found(self, user_use_cases, mock_user_repository):
        """Test user retrieval when user not found."""
        # Setup
        user_id = uuid4()
        mock_user_repository.get_by_id.return_value = None
        
        # Execute & Assert
        with pytest.raises(UserNotFoundException):
            await user_use_cases.get_user(user_id)
    
    async def test_update_user_success(
        self, 
        user_use_cases, 
        mock_user_repository, 
        sample_user_data
    ):
        """Test successful user update."""
        # Setup
        user_id = uuid4()
        user = User.create(**sample_user_data)
        user.id = user_id
        mock_user_repository.get_by_id.return_value = user
        mock_user_repository.update.return_value = user
        
        request = UpdateUserRequest(
            first_name="Jane",
            last_name="Smith",
        )
        
        # Execute
        result = await user_use_cases.update_user(user_id, request)
        
        # Assert
        assert result.first_name == "Jane"
        assert result.last_name == "Smith"
        
        mock_user_repository.get_by_id.assert_called_once_with(user_id)
        mock_user_repository.update.assert_called_once()
    
    async def test_verify_user_email(
        self, 
        user_use_cases, 
        mock_user_repository, 
        sample_user_data
    ):
        """Test user email verification."""
        # Setup
        user_id = uuid4()
        user = User.create(**sample_user_data)
        user.id = user_id
        mock_user_repository.get_by_id.return_value = user
        mock_user_repository.update.return_value = user
        
        # Execute
        result = await user_use_cases.verify_user_email(user_id)
        
        # Assert
        assert result.is_verified is True
        
        mock_user_repository.get_by_id.assert_called_once_with(user_id)
        mock_user_repository.update.assert_called_once()
    
    async def test_deactivate_user(
        self, 
        user_use_cases, 
        mock_user_repository, 
        sample_user_data
    ):
        """Test user deactivation."""
        # Setup
        user_id = uuid4()
        user = User.create(**sample_user_data)
        user.id = user_id
        mock_user_repository.get_by_id.return_value = user
        mock_user_repository.update.return_value = user
        
        # Execute
        result = await user_use_cases.deactivate_user(user_id)
        
        # Assert
        assert result.is_active is False
        
        mock_user_repository.get_by_id.assert_called_once_with(user_id)
        mock_user_repository.update.assert_called_once()
    
    async def test_list_users(self, user_use_cases, mock_user_repository, sample_user_data):
        """Test listing users."""
        # Setup
        users = [User.create(**sample_user_data) for _ in range(3)]
        mock_user_repository.list.return_value = users
        
        # Execute
        result = await user_use_cases.list_users(skip=0, limit=10)
        
        # Assert
        assert len(result) == 3
        assert all(user.email == sample_user_data["email"] for user in result)
        
        mock_user_repository.list.assert_called_once_with(skip=0, limit=10)