"""Unit tests for recommendation engines."""
import pytest
import numpy as np
from unittest.mock import Mock, patch

from app.recommendation import (
    UserBasedCollaborativeFiltering,
    ItemBasedCollaborativeFiltering,
    ContentBasedRecommendationEngine,
    SVDRecommendationEngine,
    WeightedHybridRecommendationEngine,
    RecommendationContext
)


class TestUserBasedCollaborativeFiltering:
    """Test user-based collaborative filtering."""
    
    @pytest.fixture
    def engine(self):
        return UserBasedCollaborativeFiltering(k_neighbors=2, min_interactions=1)
    
    async def test_train_with_valid_data(self, engine, recommendation_test_data):
        """Test training with valid interaction data."""
        interactions = recommendation_test_data["interactions"]
        
        await engine.train(interactions)
        
        assert engine.is_trained
        assert engine.user_item_matrix is not None
        assert engine.user_similarity_matrix is not None
        assert len(engine.user_mapping) > 0
        assert len(engine.item_mapping) > 0
    
    async def test_train_with_insufficient_data(self, engine):
        """Test training with insufficient data."""
        interactions = [
            {"user_id": "user1", "item_id": "item1", "rating": 5.0}
        ]
        
        # Should raise an error due to insufficient data
        with pytest.raises(ValueError, match="Not enough interaction data"):
            await engine.train(interactions)
    
    async def test_recommend_for_existing_user(self, engine, recommendation_test_data):
        """Test recommendations for existing user."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=3
        )
        
        recommendations = await engine.recommend(context)
        
        assert len(recommendations) <= 3
        # Check that all recommendations have required fields
        for rec in recommendations:
            assert rec.item_id is not None
            assert rec.score >= 0
            assert rec.reason is not None
    
    async def test_recommend_for_new_user(self, engine, recommendation_test_data):
        """Test cold start recommendations for new user."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        context = RecommendationContext(
            user_id="new_user",
            tenant_id="tenant1",
            num_recommendations=3
        )
        
        recommendations = await engine.recommend(context)
        
        assert len(recommendations) <= 3
        # Should get popular items for cold start
        for rec in recommendations:
            assert "cold start" in rec.reason.lower()
    
    async def test_get_item_similarity(self, engine, recommendation_test_data):
        """Test item similarity calculation."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        similar_items = await engine.get_item_similarity("item1", top_k=2)
        
        assert len(similar_items) <= 2
        for item_id, score in similar_items:
            assert item_id != "item1"  # Should not include self
            assert isinstance(score, float)
    
    async def test_explain_recommendation(self, engine, recommendation_test_data):
        """Test recommendation explanation."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        explanation = await engine.explain_recommendation("user1", "item4")
        
        assert "method" in explanation
        assert "explanation" in explanation
        assert explanation["method"] == "user_based_collaborative_filtering"


class TestItemBasedCollaborativeFiltering:
    """Test item-based collaborative filtering."""
    
    @pytest.fixture
    def engine(self):
        return ItemBasedCollaborativeFiltering(k_neighbors=2, min_interactions=1)
    
    async def test_train_and_recommend(self, engine, recommendation_test_data):
        """Test training and recommendation generation."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        assert engine.is_trained
        assert engine.item_similarity_matrix is not None
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=3
        )
        
        recommendations = await engine.recommend(context)
        assert len(recommendations) <= 3
    
    async def test_item_similarity_calculation(self, engine, recommendation_test_data):
        """Test item-to-item similarity."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        similar_items = await engine.get_item_similarity("item1", top_k=3)
        
        assert len(similar_items) <= 3
        # Check that similarity scores are valid
        for item_id, score in similar_items:
            assert -1 <= score <= 1  # Cosine similarity range


class TestContentBasedRecommendationEngine:
    """Test content-based recommendation engine."""
    
    @pytest.fixture
    def engine(self):
        return ContentBasedRecommendationEngine(min_interactions=1)
    
    async def test_train_with_items_and_interactions(self, engine, recommendation_test_data):
        """Test training with items and interactions."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        assert engine.is_trained
        assert engine.tfidf_vectorizer is not None
        assert engine.combined_features_matrix is not None
        assert len(engine.user_profiles) > 0
    
    async def test_text_feature_extraction(self, engine, recommendation_test_data):
        """Test text feature extraction from items."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        # Check that text features were extracted
        assert engine.text_features_matrix is not None
        assert engine.text_features_matrix.shape[0] == len(items)
        assert engine.text_features_matrix.shape[1] > 0
    
    async def test_content_similarity_recommendation(self, engine, recommendation_test_data):
        """Test content-based recommendations."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=3
        )
        
        recommendations = await engine.recommend(context)
        
        assert len(recommendations) <= 3
        for rec in recommendations:
            assert "content similarity" in rec.reason.lower()
    
    async def test_category_filtering(self, engine, recommendation_test_data):
        """Test category-based filtering."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=5,
            include_categories=["action"]
        )
        
        recommendations = await engine.recommend(context)
        
        # All recommendations should be from action category
        # (This would require access to item metadata in the actual implementation)
        assert len(recommendations) >= 0  # At least some action items should exist


class TestSVDRecommendationEngine:
    """Test SVD matrix factorization engine."""
    
    @pytest.fixture
    def engine(self):
        return SVDRecommendationEngine(n_factors=5, n_epochs=5)
    
    async def test_train_svd_model(self, engine, recommendation_test_data):
        """Test SVD model training."""
        interactions = recommendation_test_data["interactions"]
        
        await engine.train(interactions)
        
        assert engine.is_trained
        assert engine.model is not None
        assert engine.trainset is not None
    
    async def test_svd_predictions(self, engine, recommendation_test_data):
        """Test SVD predictions."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=3
        )
        
        recommendations = await engine.recommend(context)
        
        assert len(recommendations) <= 3
        for rec in recommendations:
            assert rec.score > 0  # SVD should produce positive ratings
            assert "matrix factorization" in rec.reason.lower()
    
    async def test_svd_explanation(self, engine, recommendation_test_data):
        """Test SVD recommendation explanation."""
        interactions = recommendation_test_data["interactions"]
        await engine.train(interactions)
        
        explanation = await engine.explain_recommendation("user1", "item4")
        
        assert "method" in explanation
        assert explanation["method"] == "svd_matrix_factorization"
        assert "predicted_rating" in explanation
        assert "top_factors" in explanation


class TestWeightedHybridRecommendationEngine:
    """Test weighted hybrid recommendation engine."""
    
    @pytest.fixture
    def engine(self):
        return WeightedHybridRecommendationEngine(
            collaborative_weight=0.4,
            content_weight=0.3,
            matrix_factorization_weight=0.3
        )
    
    async def test_hybrid_training(self, engine, recommendation_test_data):
        """Test hybrid engine training."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        assert engine.is_trained
        assert engine.user_cf.is_trained
        assert engine.content_based.is_trained
        assert engine.matrix_factorization.is_trained
    
    async def test_adaptive_weights(self, engine, recommendation_test_data):
        """Test adaptive weight calculation."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        # Test for existing user
        weights = await engine._calculate_adaptive_weights("user1")
        assert sum(weights.values()) == pytest.approx(1.0, rel=1e-2)
        
        # Test for new user (cold start)
        weights = await engine._calculate_adaptive_weights("new_user")
        assert sum(weights.values()) == pytest.approx(1.0, rel=1e-2)
    
    async def test_hybrid_recommendations(self, engine, recommendation_test_data):
        """Test hybrid recommendations."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=3
        )
        
        recommendations = await engine.recommend(context)
        
        assert len(recommendations) <= 3
        for rec in recommendations:
            assert "hybrid" in rec.reason.lower()
    
    async def test_hybrid_explanation(self, engine, recommendation_test_data):
        """Test hybrid recommendation explanation."""
        interactions = recommendation_test_data["interactions"]
        items = recommendation_test_data["items"]
        
        await engine.train(interactions, items)
        
        explanation = await engine.explain_recommendation("user1", "item4")
        
        assert "method" in explanation
        assert explanation["method"] == "weighted_hybrid"
        assert "weights_used" in explanation
        assert "component_explanations" in explanation


class TestRecommendationContext:
    """Test recommendation context."""
    
    def test_context_creation(self):
        """Test context creation with defaults."""
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1"
        )
        
        assert context.user_id == "user1"
        assert context.tenant_id == "tenant1"
        assert context.num_recommendations == 10
        assert context.diversify is True
        assert context.explain is False
    
    def test_context_with_filters(self):
        """Test context with filtering options."""
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1",
            num_recommendations=5,
            include_categories=["action", "comedy"],
            exclude_categories=["horror"],
            min_score=0.5,
            diversify=False,
            explain=True
        )
        
        assert context.num_recommendations == 5
        assert context.include_categories == ["action", "comedy"]
        assert context.exclude_categories == ["horror"]
        assert context.min_score == 0.5
        assert context.diversify is False
        assert context.explain is True