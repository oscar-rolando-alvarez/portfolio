"""Collaborative filtering recommendation engines."""
import uuid
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional
from sklearn.metrics.pairwise import cosine_similarity
from scipy.sparse import csr_matrix
from surprise import Dataset, Reader, SVD, NMF, KNNBasic, accuracy
from surprise.model_selection import train_test_split
import implicit
from app.recommendation.base import (
    BaseRecommendationEngine,
    RecommendationItem,
    RecommendationContext
)
from app.cache import cache_manager


class UserBasedCollaborativeFiltering(BaseRecommendationEngine):
    """User-based collaborative filtering."""
    
    def __init__(self, k_neighbors: int = 50, min_interactions: int = 5):
        super().__init__("user_based_cf")
        self.k_neighbors = k_neighbors
        self.min_interactions = min_interactions
        self.user_similarity_matrix = None
        self.user_item_matrix = None
        self.user_mapping = {}
        self.item_mapping = {}
        self.reverse_user_mapping = {}
        self.reverse_item_mapping = {}
    
    async def train(self, interactions: List[Dict[str, Any]], **kwargs):
        """Train user-based collaborative filtering model."""
        # Convert interactions to DataFrame
        df = pd.DataFrame(interactions)
        
        # Filter users and items with minimum interactions
        user_counts = df['user_id'].value_counts()
        item_counts = df['item_id'].value_counts()
        
        valid_users = user_counts[user_counts >= self.min_interactions].index
        valid_items = item_counts[item_counts >= self.min_interactions].index
        
        df = df[df['user_id'].isin(valid_users) & df['item_id'].isin(valid_items)]
        
        if df.empty:
            raise ValueError("Not enough interaction data for training")
        
        # Create mappings
        unique_users = df['user_id'].unique()
        unique_items = df['item_id'].unique()
        
        self.user_mapping = {user_id: idx for idx, user_id in enumerate(unique_users)}
        self.item_mapping = {item_id: idx for idx, item_id in enumerate(unique_items)}
        self.reverse_user_mapping = {idx: user_id for user_id, idx in self.user_mapping.items()}
        self.reverse_item_mapping = {idx: item_id for item_id, idx in self.item_mapping.items()}
        
        # Create user-item matrix
        n_users = len(unique_users)
        n_items = len(unique_items)
        
        user_item_matrix = np.zeros((n_users, n_items))
        
        for _, row in df.iterrows():
            user_idx = self.user_mapping[row['user_id']]
            item_idx = self.item_mapping[row['item_id']]
            # Use interaction value or default weight
            value = row.get('interaction_value', 1.0)
            if row.get('rating'):
                value = row['rating']
            user_item_matrix[user_idx, item_idx] = value
        
        self.user_item_matrix = user_item_matrix
        
        # Compute user similarity matrix
        self.user_similarity_matrix = cosine_similarity(user_item_matrix)
        
        # Cache similarity matrix
        await cache_manager.set_similarity_matrix(
            "user",
            "cosine",
            {
                "matrix": self.user_similarity_matrix.tolist(),
                "user_mapping": {str(k): v for k, v in self.user_mapping.items()},
                "item_mapping": {str(k): v for k, v in self.item_mapping.items()}
            }
        )
        
        self.is_trained = True
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate user-based collaborative filtering recommendations."""
        if not self.is_trained:
            return []
        
        # Check if user exists in training data
        if context.user_id not in self.user_mapping:
            return await self._cold_start_recommend(context)
        
        user_idx = self.user_mapping[context.user_id]
        user_vector = self.user_item_matrix[user_idx]
        
        # Find similar users
        user_similarities = self.user_similarity_matrix[user_idx]
        similar_user_indices = np.argsort(user_similarities)[::-1][1:self.k_neighbors + 1]
        
        # Generate recommendations
        recommendations = {}
        
        for similar_user_idx in similar_user_indices:
            similarity_score = user_similarities[similar_user_idx]
            similar_user_vector = self.user_item_matrix[similar_user_idx]
            
            # Find items that similar user liked but current user hasn't interacted with
            for item_idx, rating in enumerate(similar_user_vector):
                if rating > 0 and user_vector[item_idx] == 0:
                    item_id = self.reverse_item_mapping[item_idx]
                    
                    if item_id not in recommendations:
                        recommendations[item_id] = 0.0
                    
                    recommendations[item_id] += similarity_score * rating
        
        # Convert to RecommendationItem objects
        rec_items = []
        for item_id, score in recommendations.items():
            rec_items.append(RecommendationItem(
                item_id=item_id,
                score=score,
                reason="Users with similar preferences also liked this item"
            ))
        
        # Sort by score and return top N
        rec_items.sort(key=lambda x: x.score, reverse=True)
        return rec_items[:context.num_recommendations]
    
    async def _cold_start_recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Handle cold start problem by recommending popular items."""
        # Get popular items based on interaction frequency
        item_popularity = np.sum(self.user_item_matrix, axis=0)
        popular_items_idx = np.argsort(item_popularity)[::-1]
        
        recommendations = []
        for idx in popular_items_idx[:context.num_recommendations]:
            item_id = self.reverse_item_mapping[idx]
            score = float(item_popularity[idx]) / len(self.user_mapping)
            
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
        """Get similar items based on user interactions."""
        if not self.is_trained or item_id not in self.item_mapping:
            return []
        
        item_idx = self.item_mapping[item_id]
        item_vector = self.user_item_matrix[:, item_idx]
        
        similarities = []
        for other_item_idx in range(self.user_item_matrix.shape[1]):
            if other_item_idx == item_idx:
                continue
            
            other_item_vector = self.user_item_matrix[:, other_item_idx]
            similarity = cosine_similarity([item_vector], [other_item_vector])[0][0]
            
            if not np.isnan(similarity):
                other_item_id = self.reverse_item_mapping[other_item_idx]
                similarities.append((other_item_id, float(similarity)))
        
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain why an item was recommended."""
        if not self.is_trained or user_id not in self.user_mapping or item_id not in self.item_mapping:
            return {"explanation": "Not enough data for explanation"}
        
        user_idx = self.user_mapping[user_id]
        item_idx = self.item_mapping[item_id]
        
        # Find users who liked this item
        item_vector = self.user_item_matrix[:, item_idx]
        users_who_liked = np.where(item_vector > 0)[0]
        
        # Find similarity scores with these users
        user_similarities = self.user_similarity_matrix[user_idx]
        similar_users_who_liked = [
            (self.reverse_user_mapping[idx], float(user_similarities[idx]))
            for idx in users_who_liked
            if user_similarities[idx] > 0
        ]
        
        similar_users_who_liked.sort(key=lambda x: x[1], reverse=True)
        
        return {
            "method": "user_based_collaborative_filtering",
            "similar_users_count": len(similar_users_who_liked),
            "top_similar_users": similar_users_who_liked[:5],
            "explanation": f"Recommended because {len(similar_users_who_liked)} similar users also liked this item"
        }


class ItemBasedCollaborativeFiltering(BaseRecommendationEngine):
    """Item-based collaborative filtering."""
    
    def __init__(self, k_neighbors: int = 50, min_interactions: int = 5):
        super().__init__("item_based_cf")
        self.k_neighbors = k_neighbors
        self.min_interactions = min_interactions
        self.item_similarity_matrix = None
        self.user_item_matrix = None
        self.user_mapping = {}
        self.item_mapping = {}
        self.reverse_user_mapping = {}
        self.reverse_item_mapping = {}
    
    async def train(self, interactions: List[Dict[str, Any]], **kwargs):
        """Train item-based collaborative filtering model."""
        # Similar to user-based but compute item similarities
        df = pd.DataFrame(interactions)
        
        # Filter users and items with minimum interactions
        user_counts = df['user_id'].value_counts()
        item_counts = df['item_id'].value_counts()
        
        valid_users = user_counts[user_counts >= self.min_interactions].index
        valid_items = item_counts[item_counts >= self.min_interactions].index
        
        df = df[df['user_id'].isin(valid_users) & df['item_id'].isin(valid_items)]
        
        if df.empty:
            raise ValueError("Not enough interaction data for training")
        
        # Create mappings
        unique_users = df['user_id'].unique()
        unique_items = df['item_id'].unique()
        
        self.user_mapping = {user_id: idx for idx, user_id in enumerate(unique_users)}
        self.item_mapping = {item_id: idx for idx, item_id in enumerate(unique_items)}
        self.reverse_user_mapping = {idx: user_id for user_id, idx in self.user_mapping.items()}
        self.reverse_item_mapping = {idx: item_id for item_id, idx in self.item_mapping.items()}
        
        # Create user-item matrix
        n_users = len(unique_users)
        n_items = len(unique_items)
        
        user_item_matrix = np.zeros((n_users, n_items))
        
        for _, row in df.iterrows():
            user_idx = self.user_mapping[row['user_id']]
            item_idx = self.item_mapping[row['item_id']]
            value = row.get('interaction_value', 1.0)
            if row.get('rating'):
                value = row['rating']
            user_item_matrix[user_idx, item_idx] = value
        
        self.user_item_matrix = user_item_matrix
        
        # Compute item similarity matrix (transpose for item-item similarity)
        self.item_similarity_matrix = cosine_similarity(user_item_matrix.T)
        
        # Cache similarity matrix
        await cache_manager.set_similarity_matrix(
            "item",
            "cosine",
            {
                "matrix": self.item_similarity_matrix.tolist(),
                "user_mapping": {str(k): v for k, v in self.user_mapping.items()},
                "item_mapping": {str(k): v for k, v in self.item_mapping.items()}
            }
        )
        
        self.is_trained = True
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate item-based collaborative filtering recommendations."""
        if not self.is_trained:
            return []
        
        # Check if user exists in training data
        if context.user_id not in self.user_mapping:
            return await self._cold_start_recommend(context)
        
        user_idx = self.user_mapping[context.user_id]
        user_vector = self.user_item_matrix[user_idx]
        
        # Find items the user has interacted with
        user_items = np.where(user_vector > 0)[0]
        
        if len(user_items) == 0:
            return await self._cold_start_recommend(context)
        
        # Generate recommendations based on item similarities
        recommendations = {}
        
        for user_item_idx in user_items:
            user_rating = user_vector[user_item_idx]
            item_similarities = self.item_similarity_matrix[user_item_idx]
            
            # Find similar items
            similar_items = np.argsort(item_similarities)[::-1][1:self.k_neighbors + 1]
            
            for similar_item_idx in similar_items:
                # Skip if user already interacted with this item
                if user_vector[similar_item_idx] > 0:
                    continue
                
                similarity_score = item_similarities[similar_item_idx]
                item_id = self.reverse_item_mapping[similar_item_idx]
                
                if item_id not in recommendations:
                    recommendations[item_id] = 0.0
                
                recommendations[item_id] += similarity_score * user_rating
        
        # Convert to RecommendationItem objects
        rec_items = []
        for item_id, score in recommendations.items():
            rec_items.append(RecommendationItem(
                item_id=item_id,
                score=score,
                reason="Similar to items you've interacted with"
            ))
        
        # Sort by score and return top N
        rec_items.sort(key=lambda x: x.score, reverse=True)
        return rec_items[:context.num_recommendations]
    
    async def _cold_start_recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Handle cold start problem by recommending popular items."""
        item_popularity = np.sum(self.user_item_matrix, axis=0)
        popular_items_idx = np.argsort(item_popularity)[::-1]
        
        recommendations = []
        for idx in popular_items_idx[:context.num_recommendations]:
            item_id = self.reverse_item_mapping[idx]
            score = float(item_popularity[idx]) / len(self.user_mapping)
            
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
        """Get similar items."""
        if not self.is_trained or item_id not in self.item_mapping:
            return []
        
        item_idx = self.item_mapping[item_id]
        similarities = self.item_similarity_matrix[item_idx]
        
        # Get top k similar items (excluding self)
        similar_items_idx = np.argsort(similarities)[::-1][1:top_k + 1]
        
        result = []
        for idx in similar_items_idx:
            similar_item_id = self.reverse_item_mapping[idx]
            similarity_score = float(similarities[idx])
            result.append((similar_item_id, similarity_score))
        
        return result
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain why an item was recommended."""
        if not self.is_trained or user_id not in self.user_mapping or item_id not in self.item_mapping:
            return {"explanation": "Not enough data for explanation"}
        
        user_idx = self.user_mapping[user_id]
        item_idx = self.item_mapping[item_id]
        user_vector = self.user_item_matrix[user_idx]
        
        # Find items user interacted with that are similar to recommended item
        user_items = np.where(user_vector > 0)[0]
        item_similarities = self.item_similarity_matrix[item_idx]
        
        similar_user_items = [
            (self.reverse_item_mapping[idx], float(item_similarities[idx]), float(user_vector[idx]))
            for idx in user_items
            if item_similarities[idx] > 0
        ]
        
        similar_user_items.sort(key=lambda x: x[1], reverse=True)
        
        return {
            "method": "item_based_collaborative_filtering",
            "similar_items_count": len(similar_user_items),
            "top_similar_items": similar_user_items[:5],
            "explanation": f"Recommended because it's similar to {len(similar_user_items)} items you've interacted with"
        }