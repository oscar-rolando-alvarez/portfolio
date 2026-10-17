"""ML prediction domain entity."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


def _utcnow() -> datetime:
    return datetime.now(UTC)


class PredictionType(Enum):
    """Types of ML predictions."""

    PRICE_FORECAST = "price_forecast"
    TREND_ANALYSIS = "trend_analysis"
    VOLATILITY_FORECAST = "volatility_forecast"
    RISK_ASSESSMENT = "risk_assessment"
    ANOMALY_DETECTION = "anomaly_detection"


class PredictionStatus(Enum):
    """Status of predictions."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ModelType(Enum):
    """Types of ML models."""

    LINEAR_REGRESSION = "linear_regression"
    RANDOM_FOREST = "random_forest"
    LSTM = "lstm"
    TRANSFORMER = "transformer"
    ARIMA = "arima"
    PROPHET = "prophet"


@dataclass
class PredictionResult:
    """Individual prediction result."""

    timestamp: datetime
    predicted_value: Decimal
    confidence_interval_lower: Decimal | None = None
    confidence_interval_upper: Decimal | None = None
    probability: Decimal | None = None


@dataclass
class Prediction:
    """ML prediction domain entity."""

    id: UUID
    user_id: UUID
    instrument_id: UUID
    prediction_type: PredictionType
    model_type: ModelType
    status: PredictionStatus
    parameters: dict[str, Any]
    results: list[PredictionResult]
    model_accuracy: Decimal | None = None
    model_version: str | None = None
    training_data_start: datetime | None = None
    training_data_end: datetime | None = None
    prediction_horizon_days: int | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)
    completed_at: datetime | None = None

    @classmethod
    def create(
        cls,
        user_id: UUID,
        instrument_id: UUID,
        prediction_type: PredictionType,
        model_type: ModelType,
        parameters: dict[str, Any],
        prediction_horizon_days: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "Prediction":
        """Create a new prediction instance."""
        prediction_id = uuid4()
        now = datetime.now(UTC)

        return cls(
            id=prediction_id,
            user_id=user_id,
            instrument_id=instrument_id,
            prediction_type=prediction_type,
            model_type=model_type,
            status=PredictionStatus.PENDING,
            parameters=parameters,
            results=[],
            prediction_horizon_days=prediction_horizon_days,
            metadata=metadata or {},
            created_at=now,
            updated_at=now,
        )

    def start_processing(self):
        """Mark prediction as processing."""
        self.status = PredictionStatus.PROCESSING
        self.updated_at = datetime.now(UTC)

    def complete(
        self,
        results: list[PredictionResult],
        model_accuracy: Decimal | None = None,
        model_version: str | None = None,
        training_data_start: datetime | None = None,
        training_data_end: datetime | None = None,
    ):
        """Complete the prediction with results."""
        self.status = PredictionStatus.COMPLETED
        self.results = results
        self.model_accuracy = model_accuracy
        self.model_version = model_version
        self.training_data_start = training_data_start
        self.training_data_end = training_data_end
        self.completed_at = datetime.now(UTC)
        self.updated_at = datetime.now(UTC)

    def fail(self, error_message: str):
        """Mark prediction as failed."""
        self.status = PredictionStatus.FAILED
        self.error_message = error_message
        self.updated_at = datetime.now(UTC)

    @property
    def is_completed(self) -> bool:
        """Check if prediction is completed."""
        return self.status == PredictionStatus.COMPLETED

    @property
    def is_failed(self) -> bool:
        """Check if prediction failed."""
        return self.status == PredictionStatus.FAILED

    @property
    def processing_time(self) -> timedelta | None:
        """Calculate processing time if completed."""
        if self.completed_at and self.created_at:
            return self.completed_at - self.created_at
        return None
