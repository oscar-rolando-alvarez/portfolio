"""Authentication dependencies."""
from typing import Optional
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from ...application.services.auth_service import AuthService
from ...application.use_cases.user_use_cases import UserUseCases
from ...infrastructure.database.connection import get_db_session
from ...infrastructure.database.repositories.user_repository_impl import UserRepositoryImpl
from ...domain.exceptions.user_exceptions import UserNotFoundException

# Security scheme
security = HTTPBearer()


def get_auth_service() -> AuthService:
    """Get authentication service."""
    import os
    secret_key = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    return AuthService(secret_key)


async def get_user_use_cases(session: AsyncSession = Depends(get_db_session)) -> UserUseCases:
    """Get user use cases."""
    auth_service = get_auth_service()
    user_repository = UserRepositoryImpl(session)
    return UserUseCases(user_repository, auth_service)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    auth_service: AuthService = Depends(get_auth_service)
) -> UUID:
    """Get current user ID from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Verify token
    user_id_str = auth_service.verify_token(credentials.credentials)
    if user_id_str is None:
        raise credentials_exception
    
    try:
        user_id = UUID(user_id_str)
        return user_id
    except ValueError:
        raise credentials_exception


async def get_current_user(
    user_id: UUID = Depends(get_current_user_id),
    user_use_cases: UserUseCases = Depends(get_user_use_cases)
):
    """Get current user from JWT token."""
    try:
        user = await user_use_cases.get_user(user_id)
        return user
    except UserNotFoundException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    current_user = Depends(get_current_user)
):
    """Get current active user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


# Optional authentication for endpoints that work with or without auth
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    auth_service: AuthService = Depends(get_auth_service),
    user_use_cases: UserUseCases = Depends(get_user_use_cases)
):
    """Get current user optionally (returns None if not authenticated)."""
    if credentials is None:
        return None
    
    # Verify token
    user_id_str = auth_service.verify_token(credentials.credentials)
    if user_id_str is None:
        return None
    
    try:
        user_id = UUID(user_id_str)
        user = await user_use_cases.get_user(user_id)
        return user if user.is_active else None
    except (ValueError, UserNotFoundException):
        return None