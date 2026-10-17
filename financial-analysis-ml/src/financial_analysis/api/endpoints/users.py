"""User management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...application.dto.user_dto import UpdateUserRequest
from ...application.use_cases.user_use_cases import UserUseCases
from ...domain.exceptions.user_exceptions import UserNotFoundException
from ..dependencies.auth import get_current_active_user, get_user_use_cases
from ..schemas.user_schemas import UserResponseSchema, UserUpdateSchema

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponseSchema)
async def get_my_profile(current_user: UserResponseSchema = Depends(get_current_active_user)):
    """Get current user profile."""
    return current_user


@router.put("/me", response_model=UserResponseSchema)
async def update_my_profile(
    user_update: UserUpdateSchema,
    current_user: UserResponseSchema = Depends(get_current_active_user),
    user_use_cases: UserUseCases = Depends(get_user_use_cases),
):
    """Update current user profile."""
    try:
        request = UpdateUserRequest(
            first_name=user_update.first_name,
            last_name=user_update.last_name,
        )

        updated_user = await user_use_cases.update_user(current_user.id, request)
        return updated_user

    except UserNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.delete("/me")
async def deactivate_my_account(
    current_user: UserResponseSchema = Depends(get_current_active_user),
    user_use_cases: UserUseCases = Depends(get_user_use_cases),
):
    """Deactivate current user account."""
    try:
        await user_use_cases.deactivate_user(current_user.id)
        return {"message": "Account deactivated successfully"}

    except UserNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


# Admin endpoints (would require admin permissions in production)
@router.get("/", response_model=list[UserResponseSchema])
async def list_users(
    skip: int = Query(0, ge=0, description="Number of users to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of users to return"),
    current_user: UserResponseSchema = Depends(get_current_active_user),
    user_use_cases: UserUseCases = Depends(get_user_use_cases),
):
    """List all users (admin only)."""
    # Note: In production, add admin role check here
    users = await user_use_cases.list_users(skip=skip, limit=limit)
    return users
