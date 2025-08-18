"""User DTOs for application layer."""
from datetime import datetime
from typing import Optional
from dataclasses import dataclass
from uuid import UUID


@dataclass
class CreateUserRequest:
    """DTO for creating a new user."""
    email: str
    password: str
    first_name: str
    last_name: str


@dataclass
class UpdateUserRequest:
    """DTO for updating user information."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None


@dataclass
class UserLoginRequest:
    """DTO for user login."""
    email: str
    password: str


@dataclass
class UserResponse:
    """DTO for user response."""
    id: UUID
    email: str
    first_name: str
    last_name: str
    full_name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime


@dataclass
class AuthenticationResponse:
    """DTO for authentication response."""
    access_token: str
    token_type: str
    expires_in: int
    user: UserResponse