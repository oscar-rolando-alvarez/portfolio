"""User domain entity."""
from datetime import datetime
from typing import Optional
from dataclasses import dataclass
from uuid import UUID, uuid4

from ..value_objects.email import Email
from ..value_objects.password import Password


@dataclass
class User:
    """User domain entity representing a system user."""
    
    id: UUID
    email: Email
    password_hash: str
    first_name: str
    last_name: str
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime = None
    updated_at: datetime = None
    
    @classmethod
    def create(
        cls,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
    ) -> "User":
        """Create a new user instance."""
        user_id = uuid4()
        email_vo = Email(email)
        password_vo = Password(password)
        now = datetime.utcnow()
        
        return cls(
            id=user_id,
            email=email_vo,
            password_hash=password_vo.hash(),
            first_name=first_name,
            last_name=last_name,
            created_at=now,
            updated_at=now,
        )
    
    @property
    def full_name(self) -> str:
        """Get user's full name."""
        return f"{self.first_name} {self.last_name}"
    
    def update_profile(self, first_name: Optional[str] = None, last_name: Optional[str] = None):
        """Update user profile information."""
        if first_name:
            self.first_name = first_name
        if last_name:
            self.last_name = last_name
        self.updated_at = datetime.utcnow()
    
    def verify_email(self):
        """Mark user email as verified."""
        self.is_verified = True
        self.updated_at = datetime.utcnow()
    
    def deactivate(self):
        """Deactivate user account."""
        self.is_active = False
        self.updated_at = datetime.utcnow()
    
    def activate(self):
        """Activate user account."""
        self.is_active = True
        self.updated_at = datetime.utcnow()