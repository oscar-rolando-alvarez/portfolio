"""User repository interface."""
from abc import ABC, abstractmethod
from typing import Optional, List
from uuid import UUID

from ..entities.user import User


class UserRepository(ABC):
    """Abstract user repository interface."""
    
    @abstractmethod
    async def create(self, user: User) -> User:
        """Create a new user."""
        pass
    
    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        """Get user by ID."""
        pass
    
    @abstractmethod
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        pass
    
    @abstractmethod
    async def update(self, user: User) -> User:
        """Update an existing user."""
        pass
    
    @abstractmethod
    async def delete(self, user_id: UUID) -> bool:
        """Delete a user."""
        pass
    
    @abstractmethod
    async def list(self, skip: int = 0, limit: int = 100) -> List[User]:
        """List users with pagination."""
        pass
    
    @abstractmethod
    async def exists_by_email(self, email: str) -> bool:
        """Check if user exists by email."""
        pass