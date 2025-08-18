"""User use cases."""
from typing import Optional, List
from uuid import UUID
import logging

from ..dto.user_dto import (
    CreateUserRequest,
    UpdateUserRequest,
    UserLoginRequest,
    UserResponse,
    AuthenticationResponse,
)
from ...domain.entities.user import User
from ...domain.repositories.user_repository import UserRepository
from ...domain.exceptions.user_exceptions import (
    UserNotFoundException,
    UserAlreadyExistsException,
    InvalidCredentialsException,
    UserNotActiveException,
)
from ...domain.value_objects.password import Password
from ..services.auth_service import AuthService

logger = logging.getLogger(__name__)


class UserUseCases:
    """User-related use cases."""
    
    def __init__(self, user_repository: UserRepository, auth_service: AuthService):
        self.user_repository = user_repository
        self.auth_service = auth_service
    
    async def create_user(self, request: CreateUserRequest) -> UserResponse:
        """Create a new user."""
        logger.info(f"Creating user with email: {request.email}")
        
        # Check if user already exists
        if await self.user_repository.exists_by_email(request.email):
            raise UserAlreadyExistsException(request.email)
        
        # Create user entity
        user = User.create(
            email=request.email,
            password=request.password,
            first_name=request.first_name,
            last_name=request.last_name,
        )
        
        # Save user
        created_user = await self.user_repository.create(user)
        
        logger.info(f"User created successfully: {created_user.id}")
        return self._map_to_response(created_user)
    
    async def authenticate_user(self, request: UserLoginRequest) -> AuthenticationResponse:
        """Authenticate user and return access token."""
        logger.info(f"Authenticating user: {request.email}")
        
        # Get user by email
        user = await self.user_repository.get_by_email(request.email)
        if not user:
            raise InvalidCredentialsException()
        
        # Check if user is active
        if not user.is_active:
            raise UserNotActiveException()
        
        # Verify password
        password = Password(request.password)
        if not password.verify(user.password_hash):
            raise InvalidCredentialsException()
        
        # Generate access token
        access_token = self.auth_service.create_access_token(str(user.id))
        
        logger.info(f"User authenticated successfully: {user.id}")
        return AuthenticationResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=self.auth_service.token_expires_in,
            user=self._map_to_response(user),
        )
    
    async def get_user(self, user_id: UUID) -> UserResponse:
        """Get user by ID."""
        logger.info(f"Getting user: {user_id}")
        
        user = await self.user_repository.get_by_id(user_id)
        if not user:
            raise UserNotFoundException(str(user_id))
        
        return self._map_to_response(user)
    
    async def get_user_by_email(self, email: str) -> UserResponse:
        """Get user by email."""
        logger.info(f"Getting user by email: {email}")
        
        user = await self.user_repository.get_by_email(email)
        if not user:
            raise UserNotFoundException(email=email)
        
        return self._map_to_response(user)
    
    async def update_user(self, user_id: UUID, request: UpdateUserRequest) -> UserResponse:
        """Update user information."""
        logger.info(f"Updating user: {user_id}")
        
        user = await self.user_repository.get_by_id(user_id)
        if not user:
            raise UserNotFoundException(str(user_id))
        
        # Update user fields
        user.update_profile(
            first_name=request.first_name,
            last_name=request.last_name,
        )
        
        # Save updated user
        updated_user = await self.user_repository.update(user)
        
        logger.info(f"User updated successfully: {user_id}")
        return self._map_to_response(updated_user)
    
    async def verify_user_email(self, user_id: UUID) -> UserResponse:
        """Verify user email."""
        logger.info(f"Verifying email for user: {user_id}")
        
        user = await self.user_repository.get_by_id(user_id)
        if not user:
            raise UserNotFoundException(str(user_id))
        
        user.verify_email()
        updated_user = await self.user_repository.update(user)
        
        logger.info(f"Email verified for user: {user_id}")
        return self._map_to_response(updated_user)
    
    async def deactivate_user(self, user_id: UUID) -> UserResponse:
        """Deactivate user account."""
        logger.info(f"Deactivating user: {user_id}")
        
        user = await self.user_repository.get_by_id(user_id)
        if not user:
            raise UserNotFoundException(str(user_id))
        
        user.deactivate()
        updated_user = await self.user_repository.update(user)
        
        logger.info(f"User deactivated: {user_id}")
        return self._map_to_response(updated_user)
    
    async def list_users(self, skip: int = 0, limit: int = 100) -> List[UserResponse]:
        """List users with pagination."""
        logger.info(f"Listing users: skip={skip}, limit={limit}")
        
        users = await self.user_repository.list(skip=skip, limit=limit)
        
        return [self._map_to_response(user) for user in users]
    
    def _map_to_response(self, user: User) -> UserResponse:
        """Map User entity to UserResponse DTO."""
        return UserResponse(
            id=user.id,
            email=str(user.email),
            first_name=user.first_name,
            last_name=user.last_name,
            full_name=user.full_name,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )