"""Price data repository interface."""
from abc import ABC, abstractmethod
from typing import Optional, List
from datetime import datetime
from uuid import UUID

from ..entities.price_data import PriceData


class PriceDataRepository(ABC):
    """Abstract price data repository interface."""
    
    @abstractmethod
    async def create(self, price_data: PriceData) -> PriceData:
        """Create new price data."""
        pass
    
    @abstractmethod
    async def create_batch(self, price_data_list: List[PriceData]) -> List[PriceData]:
        """Create multiple price data records."""
        pass
    
    @abstractmethod
    async def get_by_id(self, price_id: UUID) -> Optional[PriceData]:
        """Get price data by ID."""
        pass
    
    @abstractmethod
    async def get_latest(self, instrument_id: UUID) -> Optional[PriceData]:
        """Get latest price data for an instrument."""
        pass
    
    @abstractmethod
    async def get_by_instrument_and_date(
        self, 
        instrument_id: UUID, 
        date: datetime
    ) -> Optional[PriceData]:
        """Get price data for specific instrument and date."""
        pass
    
    @abstractmethod
    async def get_historical(
        self,
        instrument_id: UUID,
        start_date: datetime,
        end_date: datetime,
        limit: Optional[int] = None,
    ) -> List[PriceData]:
        """Get historical price data for an instrument."""
        pass
    
    @abstractmethod
    async def get_latest_for_instruments(
        self, 
        instrument_ids: List[UUID]
    ) -> List[PriceData]:
        """Get latest price data for multiple instruments."""
        pass
    
    @abstractmethod
    async def update(self, price_data: PriceData) -> PriceData:
        """Update price data."""
        pass
    
    @abstractmethod
    async def delete(self, price_id: UUID) -> bool:
        """Delete price data."""
        pass
    
    @abstractmethod
    async def delete_old_data(self, instrument_id: UUID, before_date: datetime) -> int:
        """Delete old price data before specified date."""
        pass
    
    @abstractmethod
    async def get_date_range(self, instrument_id: UUID) -> Optional[tuple[datetime, datetime]]:
        """Get the date range of available data for an instrument."""
        pass