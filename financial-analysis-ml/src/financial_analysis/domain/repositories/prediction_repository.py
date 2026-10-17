"""Prediction repository interface."""

from abc import ABC, abstractmethod
from uuid import UUID

from ..entities.prediction import Prediction, PredictionStatus, PredictionType


class PredictionRepository(ABC):
    """Abstract prediction repository interface."""

    @abstractmethod
    async def create(self, prediction: Prediction) -> Prediction:
        """Create a new prediction."""
        pass

    @abstractmethod
    async def get_by_id(self, prediction_id: UUID) -> Prediction | None:
        """Get prediction by ID."""
        pass

    @abstractmethod
    async def get_by_user_id(
        self,
        user_id: UUID,
        skip: int = 0,
        limit: int = 100,
        prediction_type: PredictionType | None = None,
        status: PredictionStatus | None = None,
    ) -> list[Prediction]:
        """Get predictions for a user with filters."""
        pass

    @abstractmethod
    async def get_by_instrument_id(
        self,
        instrument_id: UUID,
        skip: int = 0,
        limit: int = 100,
        prediction_type: PredictionType | None = None,
        status: PredictionStatus | None = None,
    ) -> list[Prediction]:
        """Get predictions for an instrument with filters."""
        pass

    @abstractmethod
    async def update(self, prediction: Prediction) -> Prediction:
        """Update an existing prediction."""
        pass

    @abstractmethod
    async def delete(self, prediction_id: UUID) -> bool:
        """Delete a prediction."""
        pass

    @abstractmethod
    async def get_pending_predictions(self, limit: int = 100) -> list[Prediction]:
        """Get pending predictions for processing."""
        pass
