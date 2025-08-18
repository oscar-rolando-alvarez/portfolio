"""GraphQL types and schemas."""
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
import strawberry
from strawberry.scalars import JSON


@strawberry.scalar
class UUID:
    """UUID scalar type."""
    
    def serialize(value: uuid.UUID) -> str:
        return str(value)
    
    def parse_value(value: str) -> uuid.UUID:
        return uuid.UUID(value)


@strawberry.type
class Tenant:
    """Tenant GraphQL type."""
    
    id: UUID
    name: str
    domain: str
    is_active: bool
    settings: JSON
    subscription_tier: str
    created_at: datetime
    updated_at: Optional[datetime]


@strawberry.type
class User:
    """User GraphQL type."""
    
    id: UUID
    tenant_id: UUID
    email: str
    username: str
    is_active: bool
    is_verified: bool
    preferences: JSON
    profile_data: JSON
    created_at: datetime
    updated_at: Optional[datetime]
    
    @strawberry.field
    async def tenant(self, info) -> Optional[Tenant]:
        """Get user's tenant."""
        return await info.context.dataloaders.tenant_loader.load(self.tenant_id)
    
    @strawberry.field
    async def interactions(self, info, interaction_type: Optional[str] = None) -> List["Interaction"]:
        """Get user's interactions."""
        if interaction_type:
            loader = getattr(info.context.dataloaders, f"user_{interaction_type}_loader", None)
            if loader:
                return await loader.load(self.id)
        return await info.context.dataloaders.user_interactions_loader.load(self.id)
    
    @strawberry.field
    async def ratings(self, info) -> List["Rating"]:
        """Get user's ratings."""
        return await info.context.dataloaders.user_ratings_loader.load(self.id)


@strawberry.type
class Item:
    """Item GraphQL type."""
    
    id: UUID
    tenant_id: UUID
    title: str
    description: Optional[str]
    category: Optional[str]
    tags: JSON
    metadata: JSON
    content_features: JSON
    is_active: bool
    popularity_score: float
    created_at: datetime
    updated_at: Optional[datetime]
    
    @strawberry.field
    async def tenant(self, info) -> Optional[Tenant]:
        """Get item's tenant."""
        return await info.context.dataloaders.tenant_loader.load(self.tenant_id)
    
    @strawberry.field
    async def interactions(self, info, interaction_type: Optional[str] = None) -> List["Interaction"]:
        """Get item's interactions."""
        loader = info.context.dataloaders.item_interactions_loader
        return await loader.load(self.id)
    
    @strawberry.field
    async def ratings(self, info) -> List["Rating"]:
        """Get item's ratings."""
        return await info.context.dataloaders.item_ratings_loader.load(self.id)
    
    @strawberry.field
    async def average_rating(self, info) -> Optional[float]:
        """Get item's average rating."""
        ratings = await self.ratings(info)
        if not ratings:
            return None
        return sum(r.rating for r in ratings) / len(ratings)
    
    @strawberry.field
    async def similar_items(self, info, top_k: int = 10) -> List["SimilarItem"]:
        """Get similar items."""
        # This would use the recommendation engine
        from app.recommendation import WeightedHybridRecommendationEngine
        engine = WeightedHybridRecommendationEngine()
        
        try:
            similar = await engine.get_item_similarity(self.id, top_k)
            similar_items = []
            for item_id, score in similar:
                item = await info.context.dataloaders.item_loader.load(item_id)
                if item:
                    similar_items.append(SimilarItem(item=item, similarity_score=score))
            return similar_items
        except Exception:
            return []


@strawberry.type
class Interaction:
    """Interaction GraphQL type."""
    
    id: UUID
    tenant_id: UUID
    user_id: UUID
    item_id: UUID
    interaction_type: str
    interaction_value: float
    session_id: Optional[str]
    context: JSON
    created_at: datetime
    
    @strawberry.field
    async def user(self, info) -> Optional[User]:
        """Get interaction's user."""
        return await info.context.dataloaders.user_loader.load(self.user_id)
    
    @strawberry.field
    async def item(self, info) -> Optional[Item]:
        """Get interaction's item."""
        return await info.context.dataloaders.item_loader.load(self.item_id)


@strawberry.type
class Rating:
    """Rating GraphQL type."""
    
    id: UUID
    tenant_id: UUID
    user_id: UUID
    item_id: UUID
    rating: float
    review: Optional[str]
    created_at: datetime
    
    @strawberry.field
    async def user(self, info) -> Optional[User]:
        """Get rating's user."""
        return await info.context.dataloaders.user_loader.load(self.user_id)
    
    @strawberry.field
    async def item(self, info) -> Optional[Item]:
        """Get rating's item."""
        return await info.context.dataloaders.item_loader.load(self.item_id)


@strawberry.type
class RecommendationItem:
    """Recommendation item GraphQL type."""
    
    item: Item
    score: float
    reason: Optional[str]
    metadata: Optional[JSON]


@strawberry.type
class SimilarItem:
    """Similar item GraphQL type."""
    
    item: Item
    similarity_score: float


@strawberry.type
class RecommendationExplanation:
    """Recommendation explanation GraphQL type."""
    
    method: str
    explanation: str
    metadata: JSON


@strawberry.type
class RecommendationResult:
    """Recommendation result GraphQL type."""
    
    items: List[RecommendationItem]
    algorithm: str
    generated_at: datetime
    response_time_ms: float
    total_count: int
    explanation: Optional[RecommendationExplanation]


@strawberry.type
class RecommendationHistory:
    """Recommendation history GraphQL type."""
    
    id: UUID
    tenant_id: UUID
    user_id: UUID
    algorithm: str
    recommended_items: JSON
    scores: JSON
    context: JSON
    response_time_ms: Optional[float]
    created_at: datetime
    
    @strawberry.field
    async def user(self, info) -> Optional[User]:
        """Get recommendation history's user."""
        return await info.context.dataloaders.user_loader.load(self.user_id)


@strawberry.type
class AuthPayload:
    """Authentication payload GraphQL type."""
    
    access_token: str
    refresh_token: str
    user: User
    expires_in: int


@strawberry.type
class RateLimitStatus:
    """Rate limit status GraphQL type."""
    
    current_count: int
    limit: int
    remaining: int
    reset_time: datetime
    window_seconds: int


@strawberry.type
class PerformanceMetrics:
    """Performance metrics GraphQL type."""
    
    query_count: int
    average_response_time: float
    cache_hit_rate: float
    error_rate: float
    timestamp: datetime


# Input types
@strawberry.input
class LoginInput:
    """Login input type."""
    
    email: str
    password: str


@strawberry.input
class RegisterInput:
    """Register input type."""
    
    email: str
    username: str
    password: str
    tenant_domain: str


@strawberry.input
class InteractionInput:
    """Interaction input type."""
    
    item_id: UUID
    interaction_type: str
    interaction_value: Optional[float] = 1.0
    session_id: Optional[str] = None
    context: Optional[JSON] = None


@strawberry.input
class RatingInput:
    """Rating input type."""
    
    item_id: UUID
    rating: float
    review: Optional[str] = None


@strawberry.input
class ItemInput:
    """Item input type."""
    
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[JSON] = None
    metadata: Optional[JSON] = None
    content_features: Optional[JSON] = None


@strawberry.input
class RecommendationFilter:
    """Recommendation filter input type."""
    
    categories: Optional[List[str]] = None
    exclude_categories: Optional[List[str]] = None
    min_score: Optional[float] = 0.0
    max_age_days: Optional[int] = None


@strawberry.input
class RecommendationOptions:
    """Recommendation options input type."""
    
    algorithm: Optional[str] = "hybrid"
    num_recommendations: Optional[int] = 10
    diversify: Optional[bool] = True
    explain: Optional[bool] = False
    filters: Optional[RecommendationFilter] = None


# Enum types
@strawberry.enum
class InteractionType(str, strawberry.Enum):
    """Interaction type enum."""
    
    VIEW = "view"
    CLICK = "click"
    PURCHASE = "purchase"
    LIKE = "like"
    SHARE = "share"
    BOOKMARK = "bookmark"


@strawberry.enum
class RecommendationAlgorithm(str, strawberry.Enum):
    """Recommendation algorithm enum."""
    
    COLLABORATIVE = "collaborative"
    CONTENT_BASED = "content_based"
    MATRIX_FACTORIZATION = "matrix_factorization"
    HYBRID = "hybrid"
    ENSEMBLE = "ensemble"


@strawberry.enum
class SubscriptionTier(str, strawberry.Enum):
    """Subscription tier enum."""
    
    BASIC = "basic"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"