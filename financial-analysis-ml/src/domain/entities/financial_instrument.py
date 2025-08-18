"""Financial instrument domain entity."""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, Any
from dataclasses import dataclass
from uuid import UUID, uuid4


class InstrumentType(Enum):
    """Financial instrument types."""
    STOCK = "stock"
    BOND = "bond"
    COMMODITY = "commodity"
    CURRENCY = "currency"
    CRYPTO = "cryptocurrency"
    INDEX = "index"
    ETF = "etf"
    OPTION = "option"
    FUTURE = "future"


class Currency(Enum):
    """Supported currencies."""
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"
    JPY = "JPY"
    CAD = "CAD"
    AUD = "AUD"
    CHF = "CHF"


@dataclass
class FinancialInstrument:
    """Financial instrument domain entity."""
    
    id: UUID
    symbol: str
    name: str
    instrument_type: InstrumentType
    currency: Currency
    exchange: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    metadata: Dict[str, Any] = None
    is_active: bool = True
    created_at: datetime = None
    updated_at: datetime = None
    
    @classmethod
    def create(
        cls,
        symbol: str,
        name: str,
        instrument_type: InstrumentType,
        currency: Currency,
        exchange: str,
        sector: Optional[str] = None,
        industry: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "FinancialInstrument":
        """Create a new financial instrument instance."""
        instrument_id = uuid4()
        now = datetime.utcnow()
        
        return cls(
            id=instrument_id,
            symbol=symbol.upper(),
            name=name,
            instrument_type=instrument_type,
            currency=currency,
            exchange=exchange.upper(),
            sector=sector,
            industry=industry,
            description=description,
            metadata=metadata or {},
            created_at=now,
            updated_at=now,
        )
    
    def update_info(
        self,
        name: Optional[str] = None,
        sector: Optional[str] = None,
        industry: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Update instrument information."""
        if name:
            self.name = name
        if sector:
            self.sector = sector
        if industry:
            self.industry = industry
        if description:
            self.description = description
        if metadata:
            self.metadata.update(metadata)
        
        self.updated_at = datetime.utcnow()
    
    def deactivate(self):
        """Deactivate the instrument."""
        self.is_active = False
        self.updated_at = datetime.utcnow()
    
    def activate(self):
        """Activate the instrument."""
        self.is_active = True
        self.updated_at = datetime.utcnow()