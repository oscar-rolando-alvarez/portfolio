"""User API schemas."""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, validator


class UserCreateSchema(BaseModel):
    """Schema for creating a user."""
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    
    @validator('password')
    def validate_password_complexity(cls, v):
        """Validate password complexity."""
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in v):
            raise ValueError('Password must contain at least one special character')
        return v


class UserUpdateSchema(BaseModel):
    """Schema for updating user information."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)


class UserLoginSchema(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserResponseSchema(BaseModel):
    """Schema for user response."""
    id: UUID
    email: str
    first_name: str
    last_name: str
    full_name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class AuthenticationResponseSchema(BaseModel):
    """Schema for authentication response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponseSchema