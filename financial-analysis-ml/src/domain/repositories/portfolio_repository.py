"""Portfolio repository interface."""
from abc import ABC, abstractmethod
from typing import Optional, List
from uuid import UUID

from ..entities.portfolio import Portfolio


class PortfolioRepository(ABC):
    """Abstract portfolio repository interface."""
    
    @abstractmethod
    async def create(self, portfolio: Portfolio) -> Portfolio:
        """Create a new portfolio."""
        pass
    
    @abstractmethod
    async def get_by_id(self, portfolio_id: UUID) -> Optional[Portfolio]:
        """Get portfolio by ID."""
        pass
    
    @abstractmethod
    async def get_by_user_id(self, user_id: UUID) -> List[Portfolio]:
        """Get all portfolios for a user."""
        pass
    
    @abstractmethod
    async def update(self, portfolio: Portfolio) -> Portfolio:
        """Update an existing portfolio."""
        pass
    
    @abstractmethod
    async def delete(self, portfolio_id: UUID) -> bool:
        """Delete a portfolio."""
        pass
    
    @abstractmethod
    async def exists_by_name_and_user(self, name: str, user_id: UUID) -> bool:
        """Check if portfolio exists by name for a specific user."""
        pass