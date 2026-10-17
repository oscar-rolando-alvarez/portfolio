"""Financial instrument repository interface."""

import builtins
from abc import ABC, abstractmethod
from uuid import UUID

from ..entities.financial_instrument import FinancialInstrument, InstrumentType


class FinancialInstrumentRepository(ABC):
    """Abstract financial instrument repository interface."""

    @abstractmethod
    async def create(self, instrument: FinancialInstrument) -> FinancialInstrument:
        """Create a new financial instrument."""
        pass

    @abstractmethod
    async def get_by_id(self, instrument_id: UUID) -> FinancialInstrument | None:
        """Get instrument by ID."""
        pass

    @abstractmethod
    async def get_by_symbol(
        self, symbol: str, exchange: str | None = None
    ) -> FinancialInstrument | None:
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
        instrument_type: InstrumentType | None = None,
        exchange: str | None = None,
        sector: str | None = None,
        is_active: bool = True,
    ) -> list[FinancialInstrument]:
        """List instruments with pagination and filters."""
        pass

    @abstractmethod
    async def search(self, query: str, limit: int = 50) -> builtins.list[FinancialInstrument]:
        """Search instruments by name or symbol."""
        pass

    @abstractmethod
    async def exists_by_symbol(self, symbol: str, exchange: str | None = None) -> bool:
        """Check if instrument exists by symbol."""
        pass
