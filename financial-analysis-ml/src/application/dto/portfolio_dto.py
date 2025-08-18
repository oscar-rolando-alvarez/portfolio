"""Portfolio DTOs for application layer."""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from dataclasses import dataclass
from uuid import UUID

from ...domain.entities.financial_instrument import Currency


@dataclass
class CreatePortfolioRequest:
    """DTO for creating a new portfolio."""
    name: str
    description: Optional[str] = None
    base_currency: Currency = Currency.USD


@dataclass
class UpdatePortfolioRequest:
    """DTO for updating portfolio information."""
    name: Optional[str] = None
    description: Optional[str] = None


@dataclass
class AddPositionRequest:
    """DTO for adding a position to portfolio."""
    instrument_id: UUID
    quantity: Decimal
    average_cost: Decimal


@dataclass
class UpdatePositionRequest:
    """DTO for updating a position."""
    quantity: Optional[Decimal] = None
    average_cost: Optional[Decimal] = None


@dataclass
class PositionResponse:
    """DTO for position response."""
    id: UUID
    instrument_id: UUID
    instrument_symbol: Optional[str] = None
    instrument_name: Optional[str] = None
    quantity: Decimal
    average_cost: Decimal
    current_price: Optional[Decimal] = None
    market_value: Optional[Decimal] = None
    cost_basis: Decimal
    unrealized_pnl: Optional[Decimal] = None
    unrealized_pnl_percent: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime


@dataclass
class PortfolioResponse:
    """DTO for portfolio response."""
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    base_currency: Currency
    positions: List[PositionResponse]
    total_market_value: Optional[Decimal]
    total_cost_basis: Decimal
    total_unrealized_pnl: Optional[Decimal]
    total_unrealized_pnl_percent: Optional[Decimal]
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass
class PortfolioSummaryResponse:
    """DTO for portfolio summary response."""
    id: UUID
    name: str
    description: Optional[str]
    base_currency: Currency
    total_market_value: Optional[Decimal]
    total_cost_basis: Decimal
    total_unrealized_pnl: Optional[Decimal]
    total_unrealized_pnl_percent: Optional[Decimal]
    position_count: int
    created_at: datetime
    updated_at: datetime