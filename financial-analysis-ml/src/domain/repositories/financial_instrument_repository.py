"""Financial instrument repository interface."""
from abc import ABC, abstractmethod
from typing import Optional, List
from uuid import UUID

from ..entities.financial_instrument import FinancialInstrument, InstrumentType


class FinancialInstrumentRepository(ABC):
    """Abstract financial instrument repository interface."""
    
    @abstractmethod
    async def create(self, instrument: FinancialInstrument) -> FinancialInstrument:
        """Create a new financial instrument."""
        pass
    
    @abstractmethod
    async def get_by_id(self, instrument_id: UUID) -> Optional[FinancialInstrument]:
        """Get instrument by ID."""
        pass
    
    @abstractmethod
    async def get_by_symbol(self, symbol: str, exchange: str = None) -> Optional[FinancialInstrument]:
        """Get instrument by symbol and optionally exchange."""
        pass
    
    @abstractmethod
    async def update(self, instrument: FinancialInstrument) -> FinancialInstrument:
        """Update an existing instrument."""
        pass
    
    @abstractmethod
    async def delete(self, instrument_id: UUID) -> bool:
        """Delete an instrument."""
        pass
    
    @abstractmethod
    async def list(
        self, 
        skip: int = 0, 
        limit: int = 100,
        instrument_type: Optional[InstrumentType] = None,
        exchange: Optional[str] = None,
        sector: Optional[str] = None,
        is_active: bool = True,
    ) -> List[FinancialInstrument]:
        """List instruments with pagination and filters."""
        pass
    
    @abstractmethod
    async def search(self, query: str, limit: int = 50) -> List[FinancialInstrument]:
        """Search instruments by name or symbol."""
        pass
    
    @abstractmethod
    async def exists_by_symbol(self, symbol: str, exchange: str = None) -> bool:
        """Check if instrument exists by symbol."""
        pass