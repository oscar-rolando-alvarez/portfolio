"""Price data repository interface."""

from abc import ABC, abstractmethod
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
    async def create_batch(self, price_data_list: list[PriceData]) -> list[PriceData]:
        """Create multiple price data records."""
        pass

    @abstractmethod
    async def get_by_id(self, price_id: UUID) -> PriceData | None:
        """Get price data by ID."""
        pass

    @abstractmethod
    async def get_latest(self, instrument_id: UUID) -> PriceData | None:
        """Get latest price data for an instrument."""
        pass

    @abstractmethod
    async def get_by_instrument_and_date(
        self, instrument_id: UUID, date: datetime
    ) -> PriceData | None:
        """Get price data for specific instrument and date."""
        pass

    @abstractmethod
    async def get_historical(
        self,
        instrument_id: UUID,
        start_date: datetime,
        end_date: datetime,
        limit: int | None = None,
    ) -> list[PriceData]:
        """Get historical price data for an instrument."""
        pass

    @abstractmethod
    async def get_latest_for_instruments(self, instrument_ids: list[UUID]) -> list[PriceData]:
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
    async def get_date_range(self, instrument_id: UUID) -> tuple[datetime, datetime] | None:
        """Get the date range of available data for an instrument."""
        pass
