"""SQLAlchemy 2.x typed ORM models (portable across PostgreSQL and SQLite)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from financial_analysis.domain.entities.financial_instrument import Currency, InstrumentType
from financial_analysis.domain.entities.prediction import (
    ModelType,
    PredictionStatus,
    PredictionType,
)

JsonType = JSON().with_variant(JSONB(), "postgresql")
Money = Numeric(15, 6)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserModel(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    portfolios: Mapped[list[PortfolioModel]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    predictions: Mapped[list[PredictionModel]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class FinancialInstrumentModel(TimestampMixin, Base):
    __tablename__ = "financial_instruments"
    __table_args__ = (
        UniqueConstraint("symbol", "exchange", name="uq_symbol_exchange"),
        Index("ix_instrument_type_sector", "instrument_type", "sector"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(255))
    instrument_type: Mapped[InstrumentType] = mapped_column(Enum(InstrumentType), index=True)
    currency: Mapped[Currency] = mapped_column(Enum(Currency))
    exchange: Mapped[str] = mapped_column(String(20), index=True)
    sector: Mapped[str | None] = mapped_column(String(100))
    industry: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    # "metadata" is reserved on declarative classes, so the attribute is renamed.
    extra: Mapped[dict[str, Any] | None] = mapped_column("metadata", JsonType, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    price_data: Mapped[list[PriceDataModel]] = relationship(
        back_populates="instrument", cascade="all, delete-orphan"
    )
    portfolio_positions: Mapped[list[PortfolioPositionModel]] = relationship(
        back_populates="instrument"
    )
    predictions: Mapped[list[PredictionModel]] = relationship(back_populates="instrument")


class PriceDataModel(Base):
    __tablename__ = "price_data"
    __table_args__ = (
        UniqueConstraint("instrument_id", "timestamp", name="uq_instrument_timestamp"),
        Index("ix_instrument_timestamp", "instrument_id", "timestamp"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    instrument_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("financial_instruments.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    open_price: Mapped[Decimal] = mapped_column(Money)
    high_price: Mapped[Decimal] = mapped_column(Money)
    low_price: Mapped[Decimal] = mapped_column(Money)
    close_price: Mapped[Decimal] = mapped_column(Money)
    volume: Mapped[int] = mapped_column(Integer)
    adjusted_close: Mapped[Decimal | None] = mapped_column(Money)
    dividend_amount: Mapped[Decimal | None] = mapped_column(Money)
    split_coefficient: Mapped[Decimal | None] = mapped_column(Money)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    instrument: Mapped[FinancialInstrumentModel] = relationship(back_populates="price_data")


class PortfolioModel(TimestampMixin, Base):
    __tablename__ = "portfolios"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_portfolio_name"),
        Index("ix_user_portfolios", "user_id", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    base_currency: Mapped[Currency] = mapped_column(Enum(Currency), default=Currency.USD)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[UserModel] = relationship(back_populates="portfolios")
    positions: Mapped[list[PortfolioPositionModel]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )


class PortfolioPositionModel(TimestampMixin, Base):
    __tablename__ = "portfolio_positions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "instrument_id", name="uq_portfolio_instrument"),
        Index("ix_portfolio_positions", "portfolio_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("portfolios.id"))
    instrument_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("financial_instruments.id"))
    quantity: Mapped[Decimal] = mapped_column(Money)
    average_cost: Mapped[Decimal] = mapped_column(Money)

    portfolio: Mapped[PortfolioModel] = relationship(back_populates="positions")
    instrument: Mapped[FinancialInstrumentModel] = relationship(
        back_populates="portfolio_positions"
    )


class PredictionModel(TimestampMixin, Base):
    __tablename__ = "predictions"
    __table_args__ = (
        Index("ix_user_predictions", "user_id", "status"),
        Index("ix_instrument_predictions", "instrument_id", "prediction_type"),
        Index("ix_pending_predictions", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    instrument_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("financial_instruments.id"))
    prediction_type: Mapped[PredictionType] = mapped_column(Enum(PredictionType), index=True)
    model_type: Mapped[ModelType] = mapped_column(Enum(ModelType), index=True)
    status: Mapped[PredictionStatus] = mapped_column(
        Enum(PredictionStatus), default=PredictionStatus.PENDING, index=True
    )
    parameters: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    results: Mapped[list[Any] | None] = mapped_column(JsonType, default=list)
    model_accuracy: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    model_version: Mapped[str | None] = mapped_column(String(50))
    training_data_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    training_data_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    prediction_horizon_days: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict[str, Any] | None] = mapped_column("metadata", JsonType, default=dict)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[UserModel] = relationship(back_populates="predictions")
    instrument: Mapped[FinancialInstrumentModel] = relationship(back_populates="predictions")
