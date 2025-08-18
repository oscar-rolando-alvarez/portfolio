"""Prediction DTOs for application layer."""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from uuid import UUID

from ...domain.entities.prediction import PredictionType, ModelType, PredictionStatus


@dataclass
class CreatePredictionRequest:
    """DTO for creating a new prediction."""
    instrument_id: UUID
    prediction_type: PredictionType
    model_type: ModelType
    parameters: Dict[str, Any]
    prediction_horizon_days: Optional[int] = None


@dataclass
class PredictionResultResponse:
    """DTO for individual prediction result."""
    timestamp: datetime
    predicted_value: Decimal
    confidence_interval_lower: Optional[Decimal] = None
    confidence_interval_upper: Optional[Decimal] = None
    probability: Optional[Decimal] = None


@dataclass
class PredictionResponse:
    """DTO for prediction response."""
    id: UUID
    user_id: UUID
    instrument_id: UUID
    instrument_symbol: Optional[str] = None
    instrument_name: Optional[str] = None
    prediction_type: PredictionType
    model_type: ModelType
    status: PredictionStatus
    parameters: Dict[str, Any]
    results: List[PredictionResultResponse]
    model_accuracy: Optional[Decimal] = None
    model_version: Optional[str] = None
    training_data_start: Optional[datetime] = None
    training_data_end: Optional[datetime] = None
    prediction_horizon_days: Optional[int] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


@dataclass
class PredictionSummaryResponse:
    """DTO for prediction summary response."""
    id: UUID
    instrument_id: UUID
    instrument_symbol: Optional[str] = None
    prediction_type: PredictionType
    model_type: ModelType
    status: PredictionStatus
    model_accuracy: Optional[Decimal] = None
    created_at: datetime
    completed_at: Optional[datetime] = None