"""SQLAlchemy database models."""
from datetime import datetime
from decimal import Decimal
from typing import List
from uuid import uuid4
import enum

from sqlalchemy import (
    Column, String, Boolean, DateTime, Text, Integer, 
    ForeignKey, Enum, Index, UniqueConstraint, DECIMAL
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ...domain.entities.financial_instrument import InstrumentType, Currency
from ...domain.entities.prediction import PredictionType, ModelType, PredictionStatus

Base = declarative_base()


class UserModel(Base):
    """User database model."""
    
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    is_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    portfolios = relationship("PortfolioModel", back_populates="user", cascade="all, delete-orphan")
    predictions = relationship("PredictionModel", back_populates="user", cascade="all, delete-orphan")


class FinancialInstrumentModel(Base):
    """Financial instrument database model."""
    
    __tablename__ = "financial_instruments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    symbol = Column(String(20), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    instrument_type = Column(Enum(InstrumentType), nullable=False, index=True)
    currency = Column(Enum(Currency), nullable=False)
    exchange = Column(String(20), nullable=False, index=True)
    sector = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    metadata = Column(JSONB, nullable=True, default={})
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    price_data = relationship("PriceDataModel", back_populates="instrument", cascade="all, delete-orphan")
    portfolio_positions = relationship("PortfolioPositionModel", back_populates="instrument")
    predictions = relationship("PredictionModel", back_populates="instrument")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('symbol', 'exchange', name='uq_symbol_exchange'),
        Index('ix_instrument_type_sector', 'instrument_type', 'sector'),
    )


class PriceDataModel(Base):
    """Price data database model."""
    
    __tablename__ = "price_data"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    instrument_id = Column(UUID(as_uuid=True), ForeignKey("financial_instruments.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    open_price = Column(DECIMAL(15, 6), nullable=False)
    high_price = Column(DECIMAL(15, 6), nullable=False)
    low_price = Column(DECIMAL(15, 6), nullable=False)
    close_price = Column(DECIMAL(15, 6), nullable=False)
    volume = Column(Integer, nullable=False)
    adjusted_close = Column(DECIMAL(15, 6), nullable=True)
    dividend_amount = Column(DECIMAL(15, 6), nullable=True)
    split_coefficient = Column(DECIMAL(15, 6), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    instrument = relationship("FinancialInstrumentModel", back_populates="price_data")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('instrument_id', 'timestamp', name='uq_instrument_timestamp'),
        Index('ix_instrument_timestamp', 'instrument_id', 'timestamp'),
    )


class PortfolioModel(Base):
    """Portfolio database model."""
    
    __tablename__ = "portfolios"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    base_currency = Column(Enum(Currency), nullable=False, default=Currency.USD)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    user = relationship("UserModel", back_populates="portfolios")
    positions = relationship("PortfolioPositionModel", back_populates="portfolio", cascade="all, delete-orphan")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'name', name='uq_user_portfolio_name'),
        Index('ix_user_portfolios', 'user_id', 'is_active'),
    )


class PortfolioPositionModel(Base):
    """Portfolio position database model."""
    
    __tablename__ = "portfolio_positions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    portfolio_id = Column(UUID(as_uuid=True), ForeignKey("portfolios.id"), nullable=False)
    instrument_id = Column(UUID(as_uuid=True), ForeignKey("financial_instruments.id"), nullable=False)
    quantity = Column(DECIMAL(15, 6), nullable=False)
    average_cost = Column(DECIMAL(15, 6), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    portfolio = relationship("PortfolioModel", back_populates="positions")
    instrument = relationship("FinancialInstrumentModel", back_populates="portfolio_positions")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('portfolio_id', 'instrument_id', name='uq_portfolio_instrument'),
        Index('ix_portfolio_positions', 'portfolio_id'),
    )


class PredictionModel(Base):
    """Prediction database model."""
    
    __tablename__ = "predictions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    instrument_id = Column(UUID(as_uuid=True), ForeignKey("financial_instruments.id"), nullable=False)
    prediction_type = Column(Enum(PredictionType), nullable=False, index=True)
    model_type = Column(Enum(ModelType), nullable=False, index=True)
    status = Column(Enum(PredictionStatus), nullable=False, default=PredictionStatus.PENDING, index=True)
    parameters = Column(JSONB, nullable=False, default={})
    results = Column(JSONB, nullable=True, default=[])
    model_accuracy = Column(DECIMAL(5, 4), nullable=True)
    model_version = Column(String(50), nullable=True)
    training_data_start = Column(DateTime(timezone=True), nullable=True)
    training_data_end = Column(DateTime(timezone=True), nullable=True)
    prediction_horizon_days = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    metadata = Column(JSONB, nullable=True, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("UserModel", back_populates="predictions")
    instrument = relationship("FinancialInstrumentModel", back_populates="predictions")
    
    # Constraints
    __table_args__ = (
        Index('ix_user_predictions', 'user_id', 'status'),
        Index('ix_instrument_predictions', 'instrument_id', 'prediction_type'),
        Index('ix_pending_predictions', 'status', 'created_at'),
    )