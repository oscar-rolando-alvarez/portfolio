"""Financial instrument domain entity."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


def _utcnow() -> datetime:
    return datetime.now(UTC)


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
    sector: str | None = None
    industry: str | None = None
    description: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    is_active: bool = True
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)

    @classmethod
    def create(
        cls,
        symbol: str,
        name: str,
        instrument_type: InstrumentType,
        currency: Currency,
        exchange: str,
        sector: str | None = None,
        industry: str | None = None,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "FinancialInstrument":
        """Create a new financial instrument instance."""
        instrument_id = uuid4()
        now = datetime.now(UTC)

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
        name: str | None = None,
        sector: str | None = None,
        industry: str | None = None,
        description: str | None = None,
        metadata: dict[str, Any] | None = None,
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

        self.updated_at = datetime.now(UTC)

    def deactivate(self):
        """Deactivate the instrument."""
        self.is_active = False
        self.updated_at = datetime.now(UTC)

    def activate(self):
        """Activate the instrument."""
        self.is_active = True
        self.updated_at = datetime.now(UTC)
