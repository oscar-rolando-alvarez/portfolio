"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer

from ..schemas.user_schemas import (
    UserCreateSchema,
    UserLoginSchema,
    AuthenticationResponseSchema,
    UserResponseSchema,
)
from ..dependencies.auth import get_user_use_cases, get_current_active_user
from ...application.use_cases.user_use_cases import UserUseCases
from ...application.dto.user_dto import CreateUserRequest, UserLoginRequest
from ...domain.exceptions.user_exceptions import (
    UserAlreadyExistsException,
    InvalidCredentialsException,
    UserNotActiveException,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponseSchema, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreateSchema,
    user_use_cases: UserUseCases = Depends(get_user_use_cases)
):
    """Register a new user."""
    try:
        request = CreateUserRequest(
            email=user_data.email,
            password=user_data.password,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
        )
        
        user = await user_use_cases.create_user(request)
        return user
    
    except UserAlreadyExistsException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/login", response_model=AuthenticationResponseSchema)
async def login(
    credentials: UserLoginSchema,
    user_use_cases: UserUseCases = Depends(get_user_use_cases)
):
    """Authenticate user and return access token."""
    try:
        request = UserLoginRequest(
            email=credentials.email,
            password=credentials.password,
        )
        
        auth_response = await user_use_cases.authenticate_user(request)
        return auth_response
    
    except InvalidCredentialsException as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    except UserNotActiveException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/me", response_model=UserResponseSchema)
async def get_current_user_info(
    current_user: UserResponseSchema = Depends(get_current_active_user)
):
    """Get current user information."""
    return current_user


@router.post("/verify-email")
async def verify_email(
    current_user: UserResponseSchema = Depends(get_current_active_user),
    user_use_cases: UserUseCases = Depends(get_user_use_cases)
):
    """Verify user email."""
    try:
        await user_use_cases.verify_user_email(current_user.id)
        return {"message": "Email verified successfully"}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify email"
        )