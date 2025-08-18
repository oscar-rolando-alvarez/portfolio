"""Portfolio domain entity."""
from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from uuid import UUID, uuid4

from .financial_instrument import Currency


@dataclass
class PortfolioPosition:
    """Individual position within a portfolio."""
    
    id: UUID
    instrument_id: UUID
    quantity: Decimal
    average_cost: Decimal
    current_price: Optional[Decimal] = None
    created_at: datetime = None
    updated_at: datetime = None
    
    @classmethod
    def create(
        cls,
        instrument_id: UUID,
        quantity: Decimal,
        average_cost: Decimal,
        current_price: Optional[Decimal] = None,
    ) -> "PortfolioPosition":
        """Create a new portfolio position."""
        position_id = uuid4()
        now = datetime.utcnow()
        
        if quantity <= 0:
            raise ValueError("Position quantity must be positive")
        if average_cost <= 0:
            raise ValueError("Average cost must be positive")
        
        return cls(
            id=position_id,
            instrument_id=instrument_id,
            quantity=quantity,
            average_cost=average_cost,
            current_price=current_price,
            created_at=now,
            updated_at=now,
        )
    
    @property
    def market_value(self) -> Optional[Decimal]:
        """Calculate current market value of the position."""
        if self.current_price is None:
            return None
        return self.quantity * self.current_price
    
    @property
    def cost_basis(self) -> Decimal:
        """Calculate cost basis of the position."""
        return self.quantity * self.average_cost
    
    @property
    def unrealized_pnl(self) -> Optional[Decimal]:
        """Calculate unrealized profit/loss."""
        if self.market_value is None:
            return None
        return self.market_value - self.cost_basis
    
    @property
    def unrealized_pnl_percent(self) -> Optional[Decimal]:
        """Calculate unrealized profit/loss percentage."""
        if self.unrealized_pnl is None or self.cost_basis == 0:
            return None
        return (self.unrealized_pnl / self.cost_basis) * 100
    
    def update_price(self, new_price: Decimal):
        """Update current price of the position."""
        self.current_price = new_price
        self.updated_at = datetime.utcnow()
    
    def add_shares(self, quantity: Decimal, price: Decimal):
        """Add shares to the position and recalculate average cost."""
        if quantity <= 0:
            raise ValueError("Quantity to add must be positive")
        if price <= 0:
            raise ValueError("Price must be positive")
        
        total_cost = self.cost_basis + (quantity * price)
        total_quantity = self.quantity + quantity
        
        self.average_cost = total_cost / total_quantity
        self.quantity = total_quantity
        self.updated_at = datetime.utcnow()
    
    def reduce_shares(self, quantity: Decimal) -> Decimal:
        """Reduce shares from the position and return realized P&L."""
        if quantity <= 0:
            raise ValueError("Quantity to reduce must be positive")
        if quantity > self.quantity:
            raise ValueError("Cannot reduce more shares than owned")
        
        if self.current_price is None:
            raise ValueError("Current price must be set to calculate realized P&L")
        
        realized_pnl = quantity * (self.current_price - self.average_cost)
        self.quantity -= quantity
        self.updated_at = datetime.utcnow()
        
        return realized_pnl


@dataclass
class Portfolio:
    """Portfolio domain entity."""
    
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    base_currency: Currency = Currency.USD
    positions: List[PortfolioPosition] = field(default_factory=list)
    is_active: bool = True
    created_at: datetime = None
    updated_at: datetime = None
    
    @classmethod
    def create(
        cls,
        user_id: UUID,
        name: str,
        description: Optional[str] = None,
        base_currency: Currency = Currency.USD,
    ) -> "Portfolio":
        """Create a new portfolio instance."""
        portfolio_id = uuid4()
        now = datetime.utcnow()
        
        return cls(
            id=portfolio_id,
            user_id=user_id,
            name=name,
            description=description,
            base_currency=base_currency,
            created_at=now,
            updated_at=now,
        )
    
    @property
    def total_market_value(self) -> Optional[Decimal]:
        """Calculate total market value of all positions."""
        total = Decimal('0')
        has_prices = False
        
        for position in self.positions:
            if position.market_value is not None:
                total += position.market_value
                has_prices = True
        
        return total if has_prices else None
    
    @property
    def total_cost_basis(self) -> Decimal:
        """Calculate total cost basis of all positions."""
        return sum(position.cost_basis for position in self.positions)
    
    @property
    def total_unrealized_pnl(self) -> Optional[Decimal]:
        """Calculate total unrealized profit/loss."""
        if self.total_market_value is None:
            return None
        return self.total_market_value - self.total_cost_basis
    
    @property
    def total_unrealized_pnl_percent(self) -> Optional[Decimal]:
        """Calculate total unrealized profit/loss percentage."""
        if self.total_unrealized_pnl is None or self.total_cost_basis == 0:
            return None
        return (self.total_unrealized_pnl / self.total_cost_basis) * 100
    
    def add_position(self, position: PortfolioPosition):
        """Add a position to the portfolio."""
        # Check if position for this instrument already exists
        existing_position = next(
            (p for p in self.positions if p.instrument_id == position.instrument_id), 
            None
        )
        
        if existing_position:
            # Merge with existing position
            existing_position.add_shares(position.quantity, position.average_cost)
        else:
            self.positions.append(position)
        
        self.updated_at = datetime.utcnow()
    
    def remove_position(self, instrument_id: UUID):
        """Remove a position from the portfolio."""
        self.positions = [p for p in self.positions if p.instrument_id != instrument_id]
        self.updated_at = datetime.utcnow()
    
    def get_position(self, instrument_id: UUID) -> Optional[PortfolioPosition]:
        """Get a specific position by instrument ID."""
        return next(
            (p for p in self.positions if p.instrument_id == instrument_id), 
            None
        )
    
    def update_prices(self, price_updates: Dict[UUID, Decimal]):
        """Update prices for multiple positions."""
        for position in self.positions:
            if position.instrument_id in price_updates:
                position.update_price(price_updates[position.instrument_id])
        
        self.updated_at = datetime.utcnow()