"""JWT token handling."""
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class JWTHandler:
    """JWT token handler."""
    
    def __init__(self):
        self.secret_key = settings.auth.secret_key
        self.algorithm = settings.auth.algorithm
        self.access_token_expire_minutes = settings.auth.access_token_expire_minutes
        self.refresh_token_expire_days = settings.auth.refresh_token_expire_days
    
    def hash_password(self, password: str) -> str:
        """Hash password."""
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password."""
        return pwd_context.verify(plain_password, hashed_password)
    
    def create_access_token(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        email: str,
        subscription_tier: str = "basic",
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create access token."""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        
        to_encode = {
            "sub": str(user_id),
            "tenant_id": str(tenant_id),
            "email": email,
            "subscription_tier": subscription_tier,
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        }
        
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    def create_refresh_token(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create refresh token."""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=self.refresh_token_expire_days)
        
        to_encode = {
            "sub": str(user_id),
            "tenant_id": str(tenant_id),
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh"
        }
        
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify and decode token."""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.JWTError:
            return None
    
    def get_user_from_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Extract user info from token."""
        payload = self.verify_token(token)
        if payload and payload.get("type") == "access":
            return {
                "user_id": uuid.UUID(payload["sub"]),
                "tenant_id": uuid.UUID(payload["tenant_id"]),
                "email": payload["email"],
                "subscription_tier": payload.get("subscription_tier", "basic")
            }
        return None


# Global JWT handler
jwt_handler = JWTHandler()