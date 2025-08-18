"""Base recommendation engine interfaces."""
import uuid
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import numpy as np


@dataclass
class RecommendationItem:
    """Recommendation item with score."""
    item_id: uuid.UUID
    score: float
    reason: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class RecommendationContext:
    """Context for generating recommendations."""
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    num_recommendations: int = 10
    exclude_items: Optional[List[uuid.UUID]] = None
    include_categories: Optional[List[str]] = None
    exclude_categories: Optional[List[str]] = None
    min_score: float = 0.0
    diversify: bool = True
    explain: bool = False


class BaseRecommendationEngine(ABC):
    """Base class for recommendation engines."""
    
    def __init__(self, name: str):
        self.name = name
        self.is_trained = False
        self.model_version = 1
    
    @abstractmethod
    async def train(self, interactions: List[Dict[str, Any]], **kwargs):
        """Train the recommendation model."""
        pass
    
    @abstractmethod
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate recommendations for a user."""
        pass
    
    @abstractmethod
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get similar items."""
        pass
    
    @abstractmethod
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain why an item was recommended."""
        pass
    
    def _diversify_recommendations(
        self,
        recommendations: List[RecommendationItem],
        categories: Dict[uuid.UUID, str],
        max_per_category: int = 3
    ) -> List[RecommendationItem]:
        """Diversify recommendations by category."""
        if not categories:
            return recommendations
        
        category_counts = {}
        diversified = []
        
        for item in recommendations:
            category = categories.get(item.item_id, "unknown")
            current_count = category_counts.get(category, 0)
            
            if current_count < max_per_category:
                diversified.append(item)
                category_counts[category] = current_count + 1
        
        return diversified
    
    def _apply_filters(
        self,
        recommendations: List[RecommendationItem],
        context: RecommendationContext,
        item_metadata: Dict[uuid.UUID, Dict[str, Any]]
    ) -> List[RecommendationItem]:
        """Apply filters to recommendations."""
        filtered = []
        
        for item in recommendations:
            # Score filter
            if item.score < context.min_score:
                continue
            
            # Exclude items filter
            if context.exclude_items and item.item_id in context.exclude_items:
                continue
            
            metadata = item_metadata.get(item.item_id, {})
            category = metadata.get("category")
            
            # Category filters
            if context.include_categories and category not in context.include_categories:
                continue
            
            if context.exclude_categories and category in context.exclude_categories:
                continue
            
            filtered.append(item)
        
        return filtered[:context.num_recommendations]


class EnsembleRecommendationEngine(BaseRecommendationEngine):
    """Ensemble of multiple recommendation engines."""
    
    def __init__(self):
        super().__init__("ensemble")
        self.engines: List[BaseRecommendationEngine] = []
        self.weights: List[float] = []
    
    def add_engine(self, engine: BaseRecommendationEngine, weight: float = 1.0):
        """Add an engine to the ensemble."""
        self.engines.append(engine)
        self.weights.append(weight)
    
    async def train(self, interactions: List[Dict[str, Any]], **kwargs):
        """Train all engines in the ensemble."""
        for engine in self.engines:
            await engine.train(interactions, **kwargs)
        self.is_trained = all(engine.is_trained for engine in self.engines)
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate ensemble recommendations."""
        all_recommendations = {}
        total_weight = sum(self.weights)
        
        # Get recommendations from each engine
        for engine, weight in zip(self.engines, self.weights):
            try:
                engine_recs = await engine.recommend(context)
                normalized_weight = weight / total_weight
                
                for rec in engine_recs:
                    if rec.item_id not in all_recommendations:
                        all_recommendations[rec.item_id] = RecommendationItem(
                            item_id=rec.item_id,
                            score=0.0,
                            reason=f"Ensemble of {len(self.engines)} algorithms"
                        )
                    
                    # Weighted score combination
                    all_recommendations[rec.item_id].score += rec.score * normalized_weight
            
            except Exception as e:
                # Continue with other engines if one fails
                continue
        
        # Sort by combined score
        recommendations = sorted(
            all_recommendations.values(),
            key=lambda x: x.score,
            reverse=True
        )
        
        return recommendations[:context.num_recommendations]
    
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get similar items from the first available engine."""
        for engine in self.engines:
            try:
                return await engine.get_item_similarity(item_id, top_k)
            except Exception:
                continue
        return []
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain recommendation using all engines."""
        explanations = {}
        for engine in self.engines:
            try:
                explanation = await engine.explain_recommendation(user_id, item_id)
                explanations[engine.name] = explanation
            except Exception:
                continue
        
        return {
            "ensemble_explanation": explanations,
            "method": "ensemble",
            "engines_used": [engine.name for engine in self.engines]
        }