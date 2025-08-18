"""Recommendation engine module."""
from .base import (
    BaseRecommendationEngine,
    EnsembleRecommendationEngine,
    RecommendationItem,
    RecommendationContext
)
from .collaborative_filtering import (
    UserBasedCollaborativeFiltering,
    ItemBasedCollaborativeFiltering
)
from .matrix_factorization import (
    SVDRecommendationEngine,
    ImplicitMFRecommendationEngine
)
from .content_based import ContentBasedRecommendationEngine
from .hybrid import (
    WeightedHybridRecommendationEngine,
    SwitchingHybridRecommendationEngine
)

__all__ = [
    "BaseRecommendationEngine",
    "EnsembleRecommendationEngine", 
    "RecommendationItem",
    "RecommendationContext",
    "UserBasedCollaborativeFiltering",
    "ItemBasedCollaborativeFiltering",
    "SVDRecommendationEngine",
    "ImplicitMFRecommendationEngine",
    "ContentBasedRecommendationEngine",
    "WeightedHybridRecommendationEngine",
    "SwitchingHybridRecommendationEngine"
]