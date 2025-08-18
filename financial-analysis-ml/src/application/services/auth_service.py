"""Authentication service."""
from datetime import datetime, timedelta
from typing import Optional
import jwt
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class AuthService:
    """Service for handling authentication and JWT tokens."""
    
    def __init__(
        self,
        secret_key: str,
        algorithm: str = "HS256",
        access_token_expire_minutes: int = 30,
    ):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.access_token_expire_minutes = access_token_expire_minutes
    
    @property
    def token_expires_in(self) -> int:
        """Get token expiration time in seconds."""
        return self.access_token_expire_minutes * 60
    
    def create_access_token(self, user_id: str, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token."""
        logger.info(f"Creating access token for user: {user_id}")
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        
        to_encode = {
            "sub": user_id,
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access",
        }
        
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        
        logger.info(f"Access token created for user: {user_id}")
        return encoded_jwt
    
    def verify_token(self, token: str) -> Optional[str]:
        """Verify JWT token and return user ID."""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            user_id: str = payload.get("sub")
            token_type: str = payload.get("type")
            
            if user_id is None or token_type != "access":
                return None
            
            return user_id
        
        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return None
        except jwt.JWTError as e:
            logger.warning(f"JWT decode error: {e}")
            return None
    
    def create_refresh_token(self, user_id: str) -> str:
        """Create JWT refresh token."""
        logger.info(f"Creating refresh token for user: {user_id}")
        
        expire = datetime.utcnow() + timedelta(days=7)  # Refresh tokens last longer
        
        to_encode = {
            "sub": user_id,
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh",
        }
        
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        
        logger.info(f"Refresh token created for user: {user_id}")
        return encoded_jwt
    
    def verify_refresh_token(self, token: str) -> Optional[str]:
        """Verify refresh token and return user ID."""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            user_id: str = payload.get("sub")
            token_type: str = payload.get("type")
            
            if user_id is None or token_type != "refresh":
                return None
            
            return user_id
        
        except jwt.ExpiredSignatureError:
            logger.warning("Refresh token has expired")
            return None
        except jwt.JWTError as e:
            logger.warning(f"Refresh JWT decode error: {e}")
            return None