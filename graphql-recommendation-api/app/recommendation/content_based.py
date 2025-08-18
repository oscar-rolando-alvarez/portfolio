"""Content-based recommendation engine."""
import uuid
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional, Set
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler, LabelEncoder
import re
from app.recommendation.base import (
    BaseRecommendationEngine,
    RecommendationItem,
    RecommendationContext
)
from app.cache import cache_manager


class ContentBasedRecommendationEngine(BaseRecommendationEngine):
    """Content-based recommendation using item features."""
    
    def __init__(
        self,
        min_interactions: int = 1,
        text_weight: float = 0.6,
        categorical_weight: float = 0.3,
        numerical_weight: float = 0.1
    ):
        super().__init__("content_based")
        self.min_interactions = min_interactions
        self.text_weight = text_weight
        self.categorical_weight = categorical_weight
        self.numerical_weight = numerical_weight
        
        # Model components
        self.tfidf_vectorizer = None
        self.label_encoders = {}
        self.scaler = StandardScaler()
        
        # Data storage
        self.item_features = {}
        self.text_features_matrix = None
        self.categorical_features_matrix = None
        self.numerical_features_matrix = None
        self.combined_features_matrix = None
        
        # Mappings
        self.item_mapping = {}
        self.reverse_item_mapping = {}
        self.user_profiles = {}
    
    async def train(self, interactions: List[Dict[str, Any]], items: List[Dict[str, Any]], **kwargs):
        """Train content-based model."""
        # Process items data
        items_df = pd.DataFrame(items)
        interactions_df = pd.DataFrame(interactions)
        
        if items_df.empty:
            raise ValueError("No items data provided for content-based filtering")
        
        # Create item mappings
        self.item_mapping = {item_id: idx for idx, item_id in enumerate(items_df['id'])}
        self.reverse_item_mapping = {idx: item_id for item_id, idx in self.item_mapping.items()}
        
        # Store item features
        for _, item in items_df.iterrows():
            self.item_features[item['id']] = {
                'title': item.get('title', ''),
                'description': item.get('description', ''),
                'category': item.get('category', ''),
                'tags': item.get('tags', []),
                'metadata': item.get('metadata', {}),
                'content_features': item.get('content_features', {})
            }
        
        # Build feature matrices
        await self._build_text_features(items_df)
        await self._build_categorical_features(items_df)
        await self._build_numerical_features(items_df)
        await self._combine_features()
        
        # Build user profiles from interactions
        await self._build_user_profiles(interactions_df)
        
        self.is_trained = True
    
    async def _build_text_features(self, items_df: pd.DataFrame):
        """Build TF-IDF features from text content."""
        # Combine text fields
        text_content = []
        for _, item in items_df.iterrows():
            content_parts = []
            
            # Add title (with higher weight)
            title = item.get('title', '')
            if title:
                content_parts.extend([title] * 3)  # Triple weight for title
            
            # Add description
            description = item.get('description', '')
            if description:
                content_parts.append(description)
            
            # Add tags
            tags = item.get('tags', [])
            if isinstance(tags, list):
                content_parts.extend(tags)
            
            # Add category
            category = item.get('category', '')
            if category:
                content_parts.extend([category] * 2)  # Double weight for category
            
            # Join all content
            combined_content = ' '.join(content_parts)
            text_content.append(self._preprocess_text(combined_content))
        
        # Create TF-IDF matrix
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=5000,
            stop_words='english',
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.95
        )
        
        self.text_features_matrix = self.tfidf_vectorizer.fit_transform(text_content)
    
    async def _build_categorical_features(self, items_df: pd.DataFrame):
        """Build categorical features matrix."""
        categorical_features = []
        
        # Process categories
        categories = items_df['category'].fillna('unknown').astype(str)
        
        # Encode categories
        self.label_encoders['category'] = LabelEncoder()
        encoded_categories = self.label_encoders['category'].fit_transform(categories)
        
        # One-hot encode (simple approach)
        unique_categories = len(self.label_encoders['category'].classes_)
        category_matrix = np.zeros((len(items_df), unique_categories))
        for i, cat in enumerate(encoded_categories):
            category_matrix[i, cat] = 1
        
        self.categorical_features_matrix = category_matrix
    
    async def _build_numerical_features(self, items_df: pd.DataFrame):
        """Build numerical features matrix."""
        numerical_features = []
        
        for _, item in items_df.iterrows():
            features = []
            
            # Add popularity score if available
            popularity = item.get('popularity_score', 0.0)
            features.append(float(popularity))
            
            # Add numerical features from content_features
            content_features = item.get('content_features', {})
            if isinstance(content_features, dict):
                for key, value in content_features.items():
                    try:
                        features.append(float(value))
                    except (ValueError, TypeError):
                        features.append(0.0)
            
            # Pad with zeros if needed
            while len(features) < 10:  # Fixed size
                features.append(0.0)
            
            numerical_features.append(features[:10])  # Limit size
        
        # Scale numerical features
        self.numerical_features_matrix = self.scaler.fit_transform(numerical_features)
    
    async def _combine_features(self):
        """Combine all feature matrices."""
        feature_matrices = []
        
        # Add text features
        if self.text_features_matrix is not None:
            text_weighted = self.text_features_matrix * self.text_weight
            feature_matrices.append(text_weighted.toarray())
        
        # Add categorical features
        if self.categorical_features_matrix is not None:
            cat_weighted = self.categorical_features_matrix * self.categorical_weight
            feature_matrices.append(cat_weighted)
        
        # Add numerical features
        if self.numerical_features_matrix is not None:
            num_weighted = self.numerical_features_matrix * self.numerical_weight
            feature_matrices.append(num_weighted)
        
        # Combine horizontally
        if feature_matrices:
            self.combined_features_matrix = np.hstack(feature_matrices)
        else:
            raise ValueError("No features could be extracted from items")
    
    async def _build_user_profiles(self, interactions_df: pd.DataFrame):
        """Build user profiles from interactions."""
        # Group interactions by user
        for user_id in interactions_df['user_id'].unique():
            user_interactions = interactions_df[interactions_df['user_id'] == user_id]
            
            # Get interacted items
            interacted_items = []
            weights = []
            
            for _, interaction in user_interactions.iterrows():
                item_id = interaction['item_id']
                if item_id in self.item_mapping:
                    item_idx = self.item_mapping[item_id]
                    interacted_items.append(item_idx)
                    
                    # Weight by interaction value or rating
                    weight = interaction.get('interaction_value', 1.0)
                    if 'rating' in interaction:
                        weight = interaction['rating']
                    weights.append(weight)
            
            if interacted_items:
                # Create weighted average profile
                item_features = self.combined_features_matrix[interacted_items]
                weights = np.array(weights).reshape(-1, 1)
                
                # Weighted average
                user_profile = np.average(item_features, axis=0, weights=weights.flatten())
                self.user_profiles[user_id] = user_profile
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text content."""
        if not isinstance(text, str):
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Remove special characters but keep spaces
        text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
        
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        return text
    
    async def recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Generate content-based recommendations."""
        if not self.is_trained:
            return []
        
        # Check if user has a profile
        if context.user_id not in self.user_profiles:
            return await self._cold_start_recommend(context)
        
        user_profile = self.user_profiles[context.user_id]
        
        # Calculate similarities with all items
        similarities = cosine_similarity([user_profile], self.combined_features_matrix)[0]
        
        # Create recommendations
        recommendations = []
        for item_idx, similarity in enumerate(similarities):
            item_id = self.reverse_item_mapping[item_idx]
            
            # Skip if in exclude list
            if context.exclude_items and item_id in context.exclude_items:
                continue
            
            # Apply category filters
            item_features = self.item_features[item_id]
            category = item_features.get('category', '')
            
            if context.include_categories and category not in context.include_categories:
                continue
            
            if context.exclude_categories and category in context.exclude_categories:
                continue
            
            recommendations.append(RecommendationItem(
                item_id=item_id,
                score=float(similarity),
                reason=f"Similar to items you've interacted with (content similarity: {similarity:.3f})"
            ))
        
        # Sort by similarity and return top N
        recommendations.sort(key=lambda x: x.score, reverse=True)
        return recommendations[:context.num_recommendations]
    
    async def _cold_start_recommend(
        self,
        context: RecommendationContext
    ) -> List[RecommendationItem]:
        """Handle cold start with popular items in relevant categories."""
        recommendations = []
        
        # Get popular items
        popular_items = []
        for item_id, features in self.item_features.items():
            popularity = features.get('content_features', {}).get('popularity_score', 0.0)
            if isinstance(popularity, (int, float)):
                popular_items.append((item_id, float(popularity)))
        
        # Sort by popularity
        popular_items.sort(key=lambda x: x[1], reverse=True)
        
        for item_id, popularity in popular_items[:context.num_recommendations]:
            recommendations.append(RecommendationItem(
                item_id=item_id,
                score=popularity,
                reason="Popular item (cold start)"
            ))
        
        return recommendations
    
    async def get_item_similarity(
        self,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[Tuple[uuid.UUID, float]]:
        """Get items similar to the given item."""
        if not self.is_trained or item_id not in self.item_mapping:
            return []
        
        item_idx = self.item_mapping[item_id]
        item_features = self.combined_features_matrix[item_idx:item_idx+1]
        
        # Calculate similarities with all other items
        similarities = cosine_similarity(item_features, self.combined_features_matrix)[0]
        
        # Get top k similar items (excluding self)
        similar_items = []
        for idx, similarity in enumerate(similarities):
            if idx == item_idx:
                continue
            
            similar_item_id = self.reverse_item_mapping[idx]
            similar_items.append((similar_item_id, float(similarity)))
        
        # Sort by similarity and return top k
        similar_items.sort(key=lambda x: x[1], reverse=True)
        return similar_items[:top_k]
    
    async def explain_recommendation(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Explain why an item was recommended."""
        if not self.is_trained or user_id not in self.user_profiles or item_id not in self.item_mapping:
            return {"explanation": "Not enough data for explanation"}
        
        user_profile = self.user_profiles[user_id]
        item_idx = self.item_mapping[item_id]
        item_features = self.combined_features_matrix[item_idx]
        
        # Calculate similarity
        similarity = cosine_similarity([user_profile], [item_features])[0][0]
        
        # Get item details
        item_details = self.item_features[item_id]
        
        # Analyze feature contributions (simplified)
        feature_diff = np.abs(user_profile - item_features)
        top_matching_features = np.argsort(feature_diff)[:5]
        
        return {
            "method": "content_based_filtering",
            "content_similarity": float(similarity),
            "item_category": item_details.get('category', 'unknown'),
            "item_title": item_details.get('title', ''),
            "matching_features": [int(idx) for idx in top_matching_features],
            "explanation": f"Recommended based on content similarity ({similarity:.3f}) to items you've interacted with"
        }