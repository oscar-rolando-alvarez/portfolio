"""Authentication middleware."""
import uuid
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from strawberry.fastapi import BaseContext
from app.auth.jwt_handler import jwt_handler


class AuthContext(BaseContext):
    """Authentication context for GraphQL."""
    
    def __init__(self, request=None, response=None):
        super().__init__(request, response)
        self.user: Optional[Dict[str, Any]] = None
        self.tenant_id: Optional[uuid.UUID] = None
        self.subscription_tier: str = "basic"
    
    @property
    def is_authenticated(self) -> bool:
        """Check if user is authenticated."""
        return self.user is not None
    
    @property
    def user_id(self) -> Optional[uuid.UUID]:
        """Get user ID."""
        return self.user.get("user_id") if self.user else None


async def get_context(request, response) -> AuthContext:
    """Get GraphQL context with authentication."""
    context = AuthContext(request, response)
    
    # Extract token from Authorization header
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user_info = jwt_handler.get_user_from_token(token)
        if user_info:
            context.user = user_info
            context.tenant_id = user_info["tenant_id"]
            context.subscription_tier = user_info["subscription_tier"]
    
    return context


def require_auth(func):
    """Decorator to require authentication."""
    def wrapper(*args, **kwargs):
        info = args[-1] if args else kwargs.get("info")
        if not info.context.is_authenticated:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        return func(*args, **kwargs)
    return wrapper


def require_tenant(func):
    """Decorator to require tenant context."""
    def wrapper(*args, **kwargs):
        info = args[-1] if args else kwargs.get("info")
        if not info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tenant context required"
            )
        return func(*args, **kwargs)
    return wrapper


def check_subscription_tier(required_tier: str):
    """Decorator to check subscription tier."""
    tier_hierarchy = {"basic": 0, "premium": 1, "enterprise": 2}
    
    def decorator(func):
        def wrapper(*args, **kwargs):
            info = args[-1] if args else kwargs.get("info")
            user_tier = info.context.subscription_tier
            
            if tier_hierarchy.get(user_tier, 0) < tier_hierarchy.get(required_tier, 0):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Requires {required_tier} subscription or higher"
                )
            return func(*args, **kwargs)
        return wrapper
    return decorator