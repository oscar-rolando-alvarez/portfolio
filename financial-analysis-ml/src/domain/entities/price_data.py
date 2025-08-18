"""Price data domain entity."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from dataclasses import dataclass
from uuid import UUID, uuid4


@dataclass
class PriceData:
    """Price data domain entity for financial instruments."""
    
    id: UUID
    instrument_id: UUID
    timestamp: datetime
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    close_price: Decimal
    volume: int
    adjusted_close: Optional[Decimal] = None
    dividend_amount: Optional[Decimal] = None
    split_coefficient: Optional[Decimal] = None
    created_at: datetime = None
    
    @classmethod
    def create(
        cls,
        instrument_id: UUID,
        timestamp: datetime,
        open_price: Decimal,
        high_price: Decimal,
        low_price: Decimal,
        close_price: Decimal,
        volume: int,
        adjusted_close: Optional[Decimal] = None,
        dividend_amount: Optional[Decimal] = None,
        split_coefficient: Optional[Decimal] = None,
    ) -> "PriceData":
        """Create a new price data instance."""
        price_id = uuid4()
        now = datetime.utcnow()
        
        # Validate price data
        if not (low_price <= open_price <= high_price and low_price <= close_price <= high_price):
            raise ValueError("Invalid price data: prices must satisfy low <= open,close <= high")
        
        if volume < 0:
            raise ValueError("Volume cannot be negative")
        
        return cls(
            id=price_id,
            instrument_id=instrument_id,
            timestamp=timestamp,
            open_price=open_price,
            high_price=high_price,
            low_price=low_price,
            close_price=close_price,
            volume=volume,
            adjusted_close=adjusted_close or close_price,
            dividend_amount=dividend_amount,
            split_coefficient=split_coefficient,
            created_at=now,
        )
    
    @property
    def price_change(self) -> Decimal:
        """Calculate price change from open to close."""
        return self.close_price - self.open_price
    
    @property
    def price_change_percent(self) -> Decimal:
        """Calculate percentage price change."""
        if self.open_price == 0:
            return Decimal('0')
        return (self.price_change / self.open_price) * 100
    
    @property
    def trading_range(self) -> Decimal:
        """Calculate trading range (high - low)."""
        return self.high_price - self.low_price
    
    @property
    def is_up_day(self) -> bool:
        """Check if it's an up day (close > open)."""
        return self.close_price > self.open_price
    
    @property
    def is_down_day(self) -> bool:
        """Check if it's a down day (close < open)."""
        return self.close_price < self.open_price