"""Hybrid recommendation engine combining multiple approaches."""
import uuid
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from app.recommendation.base import (
    BaseRecommendationEngine,
    EnsembleRecommendationEngine,
    RecommendationItem,
    RecommendationContext
)
from app.recommendation.collaborative_filtering import (
    UserBasedCollaborativeFiltering,
    ItemBasedCollaborativeFiltering
)
from app.recommendation.matrix_factorization import (
    SVDRecommendationEngine,
    ImplicitMFRecommendationEngine
)
from app.recommendation.content_based import ContentBasedRecommendationEngine
from app.cache import cache_manager


class WeightedHybridRecommendationEngine(BaseRecommendationEngine):
    """Hybrid recommendation engine with weighted combination."""
    
    def __init__(
        self,
        collaborative_weight: float = 0.4,
        content_weight: float = 0.3,
        matrix_factorization_weight: float = 0.3,
        min_interactions_for_cf: int = 5
    ):
        super().__init__("weighted_hybrid")
        self.collaborative_weight = collaborative_weight
        self.content_weight = content_weight
        self.matrix_factorization_weight = matrix_factorization_weight
        self.min_interactions_for_cf = min_interactions_for_cf
        
        # Component engines
        self.user_cf = UserBasedCollaborativeFiltering()
        self.item_cf = ItemBasedCollaborativeFiltering()
        self.content_based = ContentBasedRecommendationEngine()
        self.matrix_factorization = SVDRecommendationEngine()
        
        # Adaptive weights based on user data availability
        self.adaptive_weights = True
    
    async def train(self, interactions: List[Dict[str, Any]], items: List[Dict[str, Any]], **kwargs):
        """Train all component engines."""
        # Train collaborative filtering engines
        await self.user_cf.train(interactions)
        await self.item_cf.train(interactions)
        
        # Train content-based engine
        await self.content_based.train(interactions, items)
        
        # Train matrix factorization engine
        await self.matrix_factorization.train(interactions)
        
        self.is_trained = True
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate hybrid recommendations."""
        if not self.is_trained:
            return []
        
        # Determine weights based on user data availability
        weights = await self._calculate_adaptive_weights(context.user_id)
        
        # Get recommendations from each engine
        all_recommendations = {}
        
        # Collaborative filtering
        if weights['collaborative'] > 0:
            try:
                # Use user-based CF as primary collaborative method
                cf_recs = await self.user_cf.recommend(context)
                self._merge_recommendations(
                    all_recommendations,
                    cf_recs,
                    weights['collaborative'],
                    "collaborative_filtering"
                )
            except Exception:
                # Fallback to item-based CF
                try:
                    cf_recs = await self.item_cf.recommend(context)
                    self._merge_recommendations(
                        all_recommendations,
                        cf_recs,
                        weights['collaborative'],
                        "collaborative_filtering"
                    )
                except Exception:
                    pass
        
        # Content-based filtering
        if weights['content'] > 0:
            try:
                content_recs = await self.content_based.recommend(context)
                self._merge_recommendations(
                    all_recommendations,
                    content_recs,
                    weights['content'],
                    "content_based"
                )
            except Exception:
                pass
        
        # Matrix factorization
        if weights['matrix_factorization'] > 0:
            try:
                mf_recs = await self.matrix_factorization.recommend(context)
                self._merge_recommendations(
                    all_recommendations,
                    mf_recs,
                    weights['matrix_factorization'],
                    "matrix_factorization"
                )
            except Exception:
                pass
        
        # Convert to sorted list
        recommendations = []
        for item_id, rec_data in all_recommendations.items():
            recommendations.append(RecommendationItem(
                item_id=item_id,
                score=rec_data['score'],
                reason=f"Hybrid recommendation (methods: {', '.join(rec_data['methods'])})"
            ))
        
        recommendations.sort(key=lambda x: x.score, reverse=True)
        return recommendations[:context.num_recommendations]
    
    def _merge_recommendations(
        self,
        all_recommendations: Dict[uuid.UUID, Dict[str, Any]],
        recommendations: List[RecommendationItem],
        weight: float,
        method: str
    ):
        """Merge recommendations with weighted scores."""
        for rec in recommendations:
            if rec.item_id not in all_recommendations:
                all_recommendations[rec.item_id] = {
                    'score': 0.0,
                    'methods': []
                }
            
            all_recommendations[rec.item_id]['score'] += rec.score * weight
            all_recommendations[rec.item_id]['methods'].append(method)
    
    async def _calculate_adaptive_weights(self, user_id: uuid.UUID) -> Dict[str, float]:
        """Calculate adaptive weights based on user data availability."""
        if not self.adaptive_weights:
            return {
                'collaborative': self.collaborative_weight,
                'content': self.content_weight,
                'matrix_factorization': self.matrix_factorization_weight
            }
        
        # Check user data availability
        has_cf_data = user_id in self.user_cf.user_mapping
        has_content_data = user_id in self.content_based.user_profiles
        has_mf_data = user_id in self.matrix_factorization.user_mapping
        
        # Calculate adaptive weights
        total_available = sum([has_cf_data, has_content_data, has_mf_data])
        
        if total_available == 0:
            # Cold start - equal weights
            return {
                'collaborative': 0.33,
                'content': 0.33,
                'matrix_factorization': 0.34
            }
        
        weights = {
            'collaborative': self.collaborative_weight if has_cf_data else 0.0,
            'content': self.content_weight if has_content_data else 0.0,
            'matrix_factorization': self.matrix_factorization_weight if has_mf_data else 0.0
        }
        
        # Redistribute weights if some methods are unavailable
        total_weight = sum(weights.values())
        if total_weight > 0:
            for key in weights:
                weights[key] /= total_weight
        
        return weights
    
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get similar items using the best available method."""
        # Try content-based first (usually most reliable for item similarity)
        try:
            return await self.content_based.get_item_similarity(item_id, top_k)
        except Exception:
            pass
        
        # Try item-based collaborative filtering
        try:
            return await self.item_cf.get_item_similarity(item_id, top_k)
        except Exception:
            pass
        
        # Try matrix factorization
        try:
            return await self.matrix_factorization.get_item_similarity(item_id, top_k)
        except Exception:
            pass
        
        return []
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain hybrid recommendation."""
        explanations = {}
        weights = await self._calculate_adaptive_weights(user_id)
        
        # Get explanations from each method
        if weights['collaborative'] > 0:
            try:
                cf_explanation = await self.user_cf.explain_recommendation(user_id, item_id)
                explanations['collaborative_filtering'] = {
                    'weight': weights['collaborative'],
                    'explanation': cf_explanation
                }
            except Exception:
                pass
        
        if weights['content'] > 0:
            try:
                content_explanation = await self.content_based.explain_recommendation(user_id, item_id)
                explanations['content_based'] = {
                    'weight': weights['content'],
                    'explanation': content_explanation
                }
            except Exception:
                pass
        
        if weights['matrix_factorization'] > 0:
            try:
                mf_explanation = await self.matrix_factorization.explain_recommendation(user_id, item_id)
                explanations['matrix_factorization'] = {
                    'weight': weights['matrix_factorization'],
                    'explanation': mf_explanation
                }
            except Exception:
                pass
        
        return {
            "method": "weighted_hybrid",
            "weights_used": weights,
            "component_explanations": explanations,
            "explanation": f"Hybrid recommendation combining {len(explanations)} methods with adaptive weights"
        }


class SwitchingHybridRecommendationEngine(BaseRecommendationEngine):
    """Hybrid engine that switches between methods based on context."""
    
    def __init__(self):
        super().__init__("switching_hybrid")
        
        # Component engines
        self.user_cf = UserBasedCollaborativeFiltering()
        self.item_cf = ItemBasedCollaborativeFiltering()
        self.content_based = ContentBasedRecommendationEngine()
        self.matrix_factorization = ImplicitMFRecommendationEngine()
        
        # Switching criteria
        self.min_interactions_for_cf = 10
        self.min_items_for_content = 5
    
    async def train(self, interactions: List[Dict[str, Any]], items: List[Dict[str, Any]], **kwargs):
        """Train all component engines."""
        await self.user_cf.train(interactions)
        await self.item_cf.train(interactions)
        await self.content_based.train(interactions, items)
        await self.matrix_factorization.train(interactions)
        
        self.is_trained = True
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate recommendations using the most appropriate method."""
        if not self.is_trained:
            return []
        
        # Choose method based on user data
        method = await self._choose_method(context.user_id)
        
        try:
            if method == "collaborative_filtering":
                return await self.user_cf.recommend(context)
            elif method == "content_based":
                return await self.content_based.recommend(context)
            elif method == "matrix_factorization":
                return await self.matrix_factorization.recommend(context)
            else:
                # Fallback to item-based CF
                return await self.item_cf.recommend(context)
        except Exception:
            # Fallback to content-based
            try:
                return await self.content_based.recommend(context)
            except Exception:
                return []
    
    async def _choose_method(self, user_id: uuid.UUID) -> str:
        """Choose the best method based on available data."""
        # Check user interaction count
        user_interaction_count = 0
        if user_id in self.user_cf.user_mapping:
            user_idx = self.user_cf.user_mapping[user_id]
            if hasattr(self.user_cf, 'user_item_matrix'):
                user_vector = self.user_cf.user_item_matrix[user_idx]
                user_interaction_count = np.sum(user_vector > 0)
        
        # Switching logic
        if user_interaction_count >= self.min_interactions_for_cf:
            # Enough data for collaborative filtering
            return "collaborative_filtering"
        elif user_id in self.content_based.user_profiles:
            # Has content profile
            return "content_based"
        elif user_id in self.matrix_factorization.user_mapping:
            # Has some interaction data for matrix factorization
            return "matrix_factorization"
        else:
            # Cold start - use content-based
            return "content_based"
    
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get similar items using content-based method."""
        return await self.content_based.get_item_similarity(item_id, top_k)
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain recommendation with method selection reasoning."""
        chosen_method = await self._choose_method(user_id)
        
        explanation = {
            "method": "switching_hybrid",
            "chosen_method": chosen_method,
            "reason_for_choice": self._get_method_choice_reason(user_id, chosen_method)
        }
        
        # Get explanation from chosen method
        try:
            if chosen_method == "collaborative_filtering":
                method_explanation = await self.user_cf.explain_recommendation(user_id, item_id)
            elif chosen_method == "content_based":
                method_explanation = await self.content_based.explain_recommendation(user_id, item_id)
            elif chosen_method == "matrix_factorization":
                method_explanation = await self.matrix_factorization.explain_recommendation(user_id, item_id)
            else:
                method_explanation = await self.item_cf.explain_recommendation(user_id, item_id)
            
            explanation["method_explanation"] = method_explanation
        except Exception:
            explanation["method_explanation"] = {"error": "Could not generate explanation"}
        
        return explanation
    
    def _get_method_choice_reason(self, user_id: uuid.UUID, chosen_method: str) -> str:
        """Get reason for method choice."""
        if chosen_method == "collaborative_filtering":
            return "User has sufficient interaction history for collaborative filtering"
        elif chosen_method == "content_based":
            return "Using content-based filtering based on item features"
        elif chosen_method == "matrix_factorization":
            return "Using matrix factorization for implicit feedback"
        else:
            return "Fallback method selected"