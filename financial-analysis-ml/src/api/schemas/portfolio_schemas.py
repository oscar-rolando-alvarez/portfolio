"""Portfolio API schemas."""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, validator

from ...domain.entities.financial_instrument import Currency


class PortfolioCreateSchema(BaseModel):
    """Schema for creating a portfolio."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    base_currency: Currency = Currency.USD


class PortfolioUpdateSchema(BaseModel):
    """Schema for updating portfolio information."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)


class PositionCreateSchema(BaseModel):
    """Schema for adding a position to portfolio."""
    instrument_id: UUID
    quantity: Decimal = Field(..., gt=0, description="Quantity must be positive")
    average_cost: Decimal = Field(..., gt=0, description="Average cost must be positive")
    
    @validator('quantity', 'average_cost')
    def validate_decimal_places(cls, v):
        """Validate decimal places."""
        if v.as_tuple().exponent < -6:
            raise ValueError('Too many decimal places (max 6)')
        return v


class PositionUpdateSchema(BaseModel):
    """Schema for updating a position."""
    quantity: Optional[Decimal] = Field(None, gt=0, description="Quantity must be positive")
    average_cost: Optional[Decimal] = Field(None, gt=0, description="Average cost must be positive")
    
    @validator('quantity', 'average_cost')
    def validate_decimal_places(cls, v):
        """Validate decimal places."""
        if v and v.as_tuple().exponent < -6:
            raise ValueError('Too many decimal places (max 6)')
        return v


class PositionResponseSchema(BaseModel):
    """Schema for position response."""
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
    
    class Config:
        from_attributes = True


class PortfolioResponseSchema(BaseModel):
    """Schema for portfolio response."""
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    base_currency: Currency
    positions: List[PositionResponseSchema] = []
    total_market_value: Optional[Decimal] = None
    total_cost_basis: Decimal
    total_unrealized_pnl: Optional[Decimal] = None
    total_unrealized_pnl_percent: Optional[Decimal] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PortfolioSummaryResponseSchema(BaseModel):
    """Schema for portfolio summary response."""
    id: UUID
    name: str
    description: Optional[str]
    base_currency: Currency
    total_market_value: Optional[Decimal] = None
    total_cost_basis: Decimal
    total_unrealized_pnl: Optional[Decimal] = None
    total_unrealized_pnl_percent: Optional[Decimal] = None
    position_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True