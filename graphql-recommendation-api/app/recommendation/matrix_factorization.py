"""Matrix factorization recommendation engines."""
import uuid
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional
from surprise import Dataset, Reader, SVD, NMF
from surprise.model_selection import cross_validate
import implicit
from scipy.sparse import coo_matrix, csr_matrix
from app.recommendation.base import (
    BaseRecommendationEngine,
    RecommendationItem,
    RecommendationContext
)
from app.config import settings


class SVDRecommendationEngine(BaseRecommendationEngine):
    """Matrix factorization using SVD (Singular Value Decomposition)."""
    
    def __init__(
        self,
        n_factors: int = None,
        n_epochs: int = 20,
        lr_all: float = 0.005,
        reg_all: float = 0.02
    ):
        super().__init__("svd_matrix_factorization")
        self.n_factors = n_factors or settings.recommendation.matrix_factorization_factors
        self.n_epochs = n_epochs
        self.lr_all = lr_all
        self.reg_all = reg_all
        self.model = None
        self.trainset = None
        self.user_mapping = {}
        self.item_mapping = {}
        self.reverse_user_mapping = {}
        self.reverse_item_mapping = {}
    
    async def train(self, interactions: List[Dict[str, Any]], **kwargs):
        """Train SVD model."""
        # Convert interactions to surprise format
        df = pd.DataFrame(interactions)
        
        # Use rating if available, otherwise use interaction_value or default to 1.0
        if 'rating' not in df.columns:
            if 'interaction_value' in df.columns:
                df['rating'] = df['interaction_value']
            else:
                df['rating'] = 1.0
        
        # Create user and item mappings
        unique_users = df['user_id'].unique()
        unique_items = df['item_id'].unique()
        
        self.user_mapping = {user_id: idx for idx, user_id in enumerate(unique_users)}
        self.item_mapping = {item_id: idx for idx, item_id in enumerate(unique_items)}
        self.reverse_user_mapping = {idx: user_id for user_id, idx in self.user_mapping.items()}
        self.reverse_item_mapping = {idx: item_id for item_id, idx in self.item_mapping.items()}
        
        # Convert to surprise dataset
        df['user_idx'] = df['user_id'].map(self.user_mapping)
        df['item_idx'] = df['item_id'].map(self.item_mapping)
        
        reader = Reader(rating_scale=(df['rating'].min(), df['rating'].max()))
        data = Dataset.load_from_df(df[['user_idx', 'item_idx', 'rating']], reader)
        
        # Train the model
        self.trainset = data.build_full_trainset()
        
        self.model = SVD(
            n_factors=self.n_factors,
            n_epochs=self.n_epochs,
            lr_all=self.lr_all,
            reg_all=self.reg_all,
            random_state=42
        )
        
        self.model.fit(self.trainset)
        self.is_trained = True
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate SVD-based recommendations."""
        if not self.is_trained:
            return []
        
        # Check if user exists in training data
        if context.user_id not in self.user_mapping:
            return await self._cold_start_recommend(context)
        
        user_idx = self.user_mapping[context.user_id]
        
        # Get all items
        recommendations = []
        
        for item_id, item_idx in self.item_mapping.items():
            # Skip items user has already interacted with
            try:
                # Check if user has rated this item
                if self.trainset.knows_user(user_idx) and self.trainset.knows_item(item_idx):
                    user_items = [item for item, _ in self.trainset.ur[user_idx]]
                    if item_idx in user_items:
                        continue
                
                # Predict rating
                prediction = self.model.predict(user_idx, item_idx)
                
                recommendations.append(RecommendationItem(
                    item_id=item_id,
                    score=float(prediction.est),
                    reason="Matrix factorization prediction"
                ))
            
            except Exception:
                continue
        
        # Sort by predicted rating and return top N
        recommendations.sort(key=lambda x: x.score, reverse=True)
        return recommendations[:context.num_recommendations]
    
    async def _cold_start_recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Handle cold start by recommending globally popular items."""
        # Calculate item popularity from training data
        item_popularity = {}
        
        for item_idx, item_id in self.reverse_item_mapping.items():
            try:
                if self.trainset.knows_item(item_idx):
                    # Get average rating for this item
                    ratings = [rating for _, rating in self.trainset.ir[item_idx]]
                    if ratings:
                        avg_rating = np.mean(ratings)
                        num_ratings = len(ratings)
                        # Weighted score considering both rating and popularity
                        popularity_score = avg_rating * np.log(1 + num_ratings)
                        item_popularity[item_id] = popularity_score
            except Exception:
                continue
        
        # Sort by popularity and create recommendations
        sorted_items = sorted(item_popularity.items(), key=lambda x: x[1], reverse=True)
        
        recommendations = []
        for item_id, score in sorted_items[:context.num_recommendations]:
            recommendations.append(RecommendationItem(
                item_id=item_id,
                score=score,
                reason="Popular item (cold start)"
            ))
        
        return recommendations
    
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get similar items using item factors."""
        if not self.is_trained or item_id not in self.item_mapping:
            return []
        
        item_idx = self.item_mapping[item_id]
        
        if not self.trainset.knows_item(item_idx):
            return []
        
        # Get item factor vector
        item_factors = self.model.qi[item_idx]
        
        similarities = []
        for other_item_id, other_item_idx in self.item_mapping.items():
            if other_item_id == item_id or not self.trainset.knows_item(other_item_idx):
                continue
            
            # Calculate cosine similarity between item factors
            other_item_factors = self.model.qi[other_item_idx]
            similarity = np.dot(item_factors, other_item_factors) / (
                np.linalg.norm(item_factors) * np.linalg.norm(other_item_factors)
            )
            
            similarities.append((other_item_id, float(similarity)))
        
        # Sort by similarity and return top k
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain SVD recommendation."""
        if not self.is_trained or user_id not in self.user_mapping or item_id not in self.item_mapping:
            return {"explanation": "Not enough data for explanation"}
        
        user_idx = self.user_mapping[user_id]
        item_idx = self.item_mapping[item_id]
        
        # Get prediction
        prediction = self.model.predict(user_idx, item_idx)
        
        # Get user and item factors
        user_factors = self.model.pu[user_idx]
        item_factors = self.model.qi[item_idx]
        
        # Calculate contribution of each factor
        factor_contributions = user_factors * item_factors
        top_factors = np.argsort(np.abs(factor_contributions))[::-1][:5]
        
        return {
            "method": "svd_matrix_factorization",
            "predicted_rating": float(prediction.est),
            "confidence": float(prediction.est - prediction.est),  # Would need validation set for proper confidence
            "top_factors": [
                {
                    "factor_index": int(idx),
                    "contribution": float(factor_contributions[idx]),
                    "user_factor": float(user_factors[idx]),
                    "item_factor": float(item_factors[idx])
                }
                for idx in top_factors
            ],
            "explanation": f"Predicted rating of {prediction.est:.2f} based on {self.n_factors} latent factors"
        }


class ImplicitMFRecommendationEngine(BaseRecommendationEngine):
    """Matrix factorization for implicit feedback using the implicit library."""
    
    def __init__(
        self,
        factors: int = None,
        iterations: int = None,
        regularization: float = 0.01,
        alpha: float = 1.0
    ):
        super().__init__("implicit_matrix_factorization")
        self.factors = factors or settings.recommendation.matrix_factorization_factors
        self.iterations = iterations or settings.recommendation.matrix_factorization_iterations
        self.regularization = regularization
        self.alpha = alpha
        self.model = None
        self.user_item_matrix = None
        self.user_mapping = {}
        self.item_mapping = {}
        self.reverse_user_mapping = {}
        self.reverse_item_mapping = {}
    
    async def train(self, interactions: List[Dict[str, Any]], **kwargs):
        """Train implicit matrix factorization model."""
        df = pd.DataFrame(interactions)
        
        # Create user and item mappings
        unique_users = df['user_id'].unique()
        unique_items = df['item_id'].unique()
        
        self.user_mapping = {user_id: idx for idx, user_id in enumerate(unique_users)}
        self.item_mapping = {item_id: idx for idx, item_id in enumerate(unique_items)}
        self.reverse_user_mapping = {idx: user_id for user_id, idx in self.user_mapping.items()}
        self.reverse_item_mapping = {idx: item_id for item_id, idx in self.item_mapping.items()}
        
        # Convert to matrix format
        df['user_idx'] = df['user_id'].map(self.user_mapping)
        df['item_idx'] = df['item_id'].map(self.item_mapping)
        
        # Use interaction_value or create confidence scores
        if 'interaction_value' in df.columns:
            df['confidence'] = df['interaction_value']
        else:
            df['confidence'] = 1.0
        
        # Apply alpha parameter to increase confidence
        df['confidence'] = 1 + self.alpha * df['confidence']
        
        # Create sparse matrix
        row = df['user_idx'].values
        col = df['item_idx'].values
        data = df['confidence'].values
        
        n_users = len(unique_users)
        n_items = len(unique_items)
        
        self.user_item_matrix = csr_matrix(
            (data, (row, col)),
            shape=(n_users, n_items)
        )
        
        # Train model
        self.model = implicit.als.AlternatingLeastSquares(
            factors=self.factors,
            iterations=self.iterations,
            regularization=self.regularization,
            random_state=42
        )
        
        self.model.fit(self.user_item_matrix)
        self.is_trained = True
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate implicit MF recommendations."""
        if not self.is_trained:
            return []
        
        # Check if user exists in training data
        if context.user_id not in self.user_mapping:
            return await self._cold_start_recommend(context)
        
        user_idx = self.user_mapping[context.user_id]
        
        # Get recommendations from model
        item_ids, scores = self.model.recommend(
            user_idx,
            self.user_item_matrix[user_idx],
            N=context.num_recommendations * 2,  # Get more to filter later
            filter_already_liked_items=True
        )
        
        recommendations = []
        for item_idx, score in zip(item_ids, scores):
            item_id = self.reverse_item_mapping.get(item_idx)
            if item_id:
                recommendations.append(RecommendationItem(
                    item_id=item_id,
                    score=float(score),
                    reason="Implicit matrix factorization"
                ))
        
        return recommendations[:context.num_recommendations]
    
    async def _cold_start_recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Handle cold start with popular items."""
        # Calculate item popularity
        item_popularity = np.array(self.user_item_matrix.sum(axis=0)).flatten()
        popular_items_idx = np.argsort(item_popularity)[::-1]
        
        recommendations = []
        for idx in popular_items_idx[:context.num_recommendations]:
            item_id = self.reverse_item_mapping.get(idx)
            if item_id:
                score = float(item_popularity[idx]) / self.user_item_matrix.shape[0]
                recommendations.append(RecommendationItem(
                    item_id=item_id,
                    score=score,
                    reason="Popular item (cold start)"
                ))
        
        return recommendations
    
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get similar items using item factors."""
        if not self.is_trained or item_id not in self.item_mapping:
            return []
        
        item_idx = self.item_mapping[item_id]
        
        # Get similar items from model
        similar_items = self.model.similar_items(item_idx, N=top_k + 1)
        
        similarities = []
        for similar_item_idx, score in similar_items:
            if similar_item_idx == item_idx:
                continue
                
            similar_item_id = self.reverse_item_mapping.get(similar_item_idx)
            if similar_item_id:
                similarities.append((similar_item_id, float(score)))
        
        return similarities[:top_k]
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain implicit MF recommendation."""
        if not self.is_trained or user_id not in self.user_mapping or item_id not in self.item_mapping:
            return {"explanation": "Not enough data for explanation"}
        
        user_idx = self.user_mapping[user_id]
        item_idx = self.item_mapping[item_id]
        
        # Get factors
        user_factors = self.model.user_factors[user_idx]
        item_factors = self.model.item_factors[item_idx]
        
        # Calculate score
        score = np.dot(user_factors, item_factors)
        
        # Get user's interaction history
        user_items = self.user_item_matrix[user_idx].nonzero()[1]
        interacted_items = [self.reverse_item_mapping[idx] for idx in user_items[:5]]
        
        return {
            "method": "implicit_matrix_factorization",
            "confidence_score": float(score),
            "factors_used": self.factors,
            "user_interaction_count": len(user_items),
            "recent_interactions": interacted_items,
            "explanation": f"Recommended based on {self.factors} latent factors derived from your interaction patterns"
        }