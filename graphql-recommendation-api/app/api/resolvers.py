"""GraphQL resolvers."""
import uuid
import time
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import HTTPException, status
import strawberry
from sqlalchemy import select, and_, func, desc
from sqlalchemy.orm import selectinload

from app.api.types import (
    User, Item, Interaction, Rating, Tenant, RecommendationResult,
    RecommendationItem, AuthPayload, RateLimitStatus, PerformanceMetrics,
    LoginInput, RegisterInput, InteractionInput, RatingInput, ItemInput,
    RecommendationOptions, RecommendationAlgorithm, RecommendationExplanation
)
from app.auth import jwt_handler, require_auth, require_tenant
from app.database import get_async_session
from app.models import (
    User as UserModel, Item as ItemModel, Interaction as InteractionModel,
    Rating as RatingModel, Tenant as TenantModel, RecommendationHistory as RecommendationHistoryModel
)
from app.recommendation import (
    WeightedHybridRecommendationEngine, RecommendationContext
)
from app.middleware import graphql_rate_limiter
from app.cache import cache_manager
from app.utils import vector_db_manager
from app.monitoring.metrics import metrics_collector


@strawberry.type
class Query:
    """GraphQL queries."""
    
    @strawberry.field
    async def me(self, info) -> Optional[User]:
        """Get current user."""
        if not info.context.is_authenticated:
            return None
        
        return await info.context.dataloaders.user_loader.load(info.context.user_id)
    
    @strawberry.field
    @require_auth
    async def user(self, info, user_id: uuid.UUID) -> Optional[User]:
        """Get user by ID."""
        # Check if user belongs to same tenant
        user = await info.context.dataloaders.user_loader.load(user_id)
        if user and user.tenant_id != info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        return user
    
    @strawberry.field
    @require_auth
    async def users(
        self,
        info,
        limit: int = 10,
        offset: int = 0
    ) -> List[User]:
        """Get users in tenant."""
        async for session in get_async_session():
            stmt = select(UserModel).where(
                UserModel.tenant_id == info.context.tenant_id
            ).limit(limit).offset(offset)
            
            result = await session.execute(stmt)
            users = result.scalars().all()
            
            # Prime dataloaders
            for user in users:
                await info.context.dataloaders.prime_user(user)
            
            return [User(**user.to_dict()) for user in users]
    
    @strawberry.field
    @require_auth
    async def item(self, info, item_id: uuid.UUID) -> Optional[Item]:
        """Get item by ID."""
        item = await info.context.dataloaders.item_loader.load(item_id)
        if item and item.tenant_id != info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        return item
    
    @strawberry.field
    @require_auth
    async def items(
        self,
        info,
        category: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 10,
        offset: int = 0
    ) -> List[Item]:
        """Get items in tenant."""
        async for session in get_async_session():
            stmt = select(ItemModel).where(
                and_(
                    ItemModel.tenant_id == info.context.tenant_id,
                    ItemModel.is_active == True
                )
            )
            
            if category:
                stmt = stmt.where(ItemModel.category == category)
            
            if search:
                stmt = stmt.where(
                    ItemModel.title.ilike(f"%{search}%") |
                    ItemModel.description.ilike(f"%{search}%")
                )
            
            stmt = stmt.limit(limit).offset(offset).order_by(desc(ItemModel.popularity_score))
            
            result = await session.execute(stmt)
            items = result.scalars().all()
            
            # Prime dataloaders
            for item in items:
                await info.context.dataloaders.prime_item(item)
            
            return [Item(**item.to_dict()) for item in items]
    
    @strawberry.field
    @require_auth
    async def recommendations(
        self,
        info,
        options: Optional[RecommendationOptions] = None
    ) -> RecommendationResult:
        """Get recommendations for current user."""
        start_time = time.time()
        
        # Check rate limits
        rate_limit_info = await graphql_rate_limiter.check_graphql_rate_limit(
            info.context.request,
            "query",
            "recommend",
            info.context.user_id,
            info.context.tenant_id,
            info.context.subscription_tier
        )
        
        if rate_limit_info and "error" in rate_limit_info:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=rate_limit_info["error"]
            )
        
        # Set defaults
        if not options:
            options = RecommendationOptions()
        
        num_recommendations = options.num_recommendations or 10
        algorithm = options.algorithm or "hybrid"
        
        # Check cache first
        cached_recommendations = await cache_manager.get_recommendations(
            info.context.user_id,
            algorithm,
            num_recommendations
        )
        
        if cached_recommendations:
            return RecommendationResult(
                items=[RecommendationItem(**item) for item in cached_recommendations],
                algorithm=algorithm,
                generated_at=datetime.utcnow(),
                response_time_ms=(time.time() - start_time) * 1000,
                total_count=len(cached_recommendations)
            )
        
        # Create recommendation context
        context = RecommendationContext(
            user_id=info.context.user_id,
            tenant_id=info.context.tenant_id,
            num_recommendations=num_recommendations,
            diversify=options.diversify or True,
            explain=options.explain or False
        )
        
        if options.filters:
            context.include_categories = options.filters.categories
            context.exclude_categories = options.filters.exclude_categories
            context.min_score = options.filters.min_score or 0.0
        
        # Get recommendations
        engine = WeightedHybridRecommendationEngine()
        
        try:
            # Load training data if needed
            if not engine.is_trained:
                await _train_recommendation_engine(engine, info.context.tenant_id)
            
            recommendations = await engine.recommend(context)
            
            # Convert to GraphQL types
            recommendation_items = []
            for rec in recommendations:
                item = await info.context.dataloaders.item_loader.load(rec.item_id)
                if item:
                    recommendation_items.append(RecommendationItem(
                        item=Item(**item.to_dict()),
                        score=rec.score,
                        reason=rec.reason,
                        metadata=rec.metadata
                    ))
            
            # Cache recommendations
            cache_data = [
                {
                    "item_id": str(item.item.id),
                    "score": item.score,
                    "reason": item.reason,
                    "metadata": item.metadata
                }
                for item in recommendation_items
            ]
            await cache_manager.set_recommendations(
                info.context.user_id,
                algorithm,
                cache_data,
                num_recommendations
            )
            
            # Save to history
            await _save_recommendation_history(
                info.context.user_id,
                info.context.tenant_id,
                algorithm,
                [str(item.item.id) for item in recommendation_items],
                [item.score for item in recommendation_items],
                (time.time() - start_time) * 1000
            )
            
            # Get explanation if requested
            explanation = None
            if options.explain and recommendation_items:
                first_item = recommendation_items[0]
                explanation_data = await engine.explain_recommendation(
                    info.context.user_id,
                    first_item.item.id
                )
                explanation = RecommendationExplanation(
                    method=explanation_data.get("method", algorithm),
                    explanation=explanation_data.get("explanation", ""),
                    metadata=explanation_data
                )
            
            response_time = (time.time() - start_time) * 1000
            
            # Record metrics
            await metrics_collector.record_recommendation_request(
                algorithm, response_time, len(recommendation_items)
            )
            
            return RecommendationResult(
                items=recommendation_items,
                algorithm=algorithm,
                generated_at=datetime.utcnow(),
                response_time_ms=response_time,
                total_count=len(recommendation_items),
                explanation=explanation
            )
            
        except Exception as e:
            # Record error metric
            await metrics_collector.record_error("recommendation_error")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate recommendations: {str(e)}"
            )
    
    @strawberry.field
    @require_auth
    async def similar_items(
        self,
        info,
        item_id: uuid.UUID,
        top_k: int = 10
    ) -> List[RecommendationItem]:
        """Get items similar to the given item."""
        # Check rate limits
        rate_limit_info = await graphql_rate_limiter.check_graphql_rate_limit(
            info.context.request,
            "query",
            "similarItems",
            info.context.user_id,
            info.context.tenant_id,
            info.context.subscription_tier
        )
        
        if rate_limit_info and "error" in rate_limit_info:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=rate_limit_info["error"]
            )
        
        # Verify item belongs to tenant
        item = await info.context.dataloaders.item_loader.load(item_id)
        if not item or item.tenant_id != info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Get similar items
        engine = WeightedHybridRecommendationEngine()
        
        try:
            if not engine.is_trained:
                await _train_recommendation_engine(engine, info.context.tenant_id)
            
            similar_items = await engine.get_item_similarity(item_id, top_k)
            
            # Convert to GraphQL types
            recommendation_items = []
            for similar_item_id, score in similar_items:
                similar_item = await info.context.dataloaders.item_loader.load(similar_item_id)
                if similar_item:
                    recommendation_items.append(RecommendationItem(
                        item=Item(**similar_item.to_dict()),
                        score=score,
                        reason=f"Similar to {item.title}"
                    ))
            
            return recommendation_items
            
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get similar items: {str(e)}"
            )
    
    @strawberry.field
    @require_auth
    async def rate_limit_status(self, info) -> RateLimitStatus:
        """Get current rate limit status."""
        status_info = await graphql_rate_limiter.rate_limiter.get_rate_limit_status(
            info.context.user_id,
            info.context.tenant_id
        )
        
        # Return user-specific status
        user_status = status_info.get("user", {})
        current_count = user_status.get("current_count", 0)
        limit_str = user_status.get("limit", "1000/hour")
        
        # Parse limit
        limit, window_seconds = await graphql_rate_limiter.rate_limiter._parse_limit(limit_str)
        
        return RateLimitStatus(
            current_count=current_count,
            limit=limit,
            remaining=max(0, limit - current_count),
            reset_time=datetime.utcnow() + timedelta(seconds=window_seconds),
            window_seconds=window_seconds
        )
    
    @strawberry.field
    @require_auth
    async def performance_metrics(self, info) -> PerformanceMetrics:
        """Get performance metrics."""
        metrics = await metrics_collector.get_current_metrics()
        
        return PerformanceMetrics(
            query_count=metrics.get("query_count", 0),
            average_response_time=metrics.get("average_response_time", 0.0),
            cache_hit_rate=metrics.get("cache_hit_rate", 0.0),
            error_rate=metrics.get("error_rate", 0.0),
            timestamp=datetime.utcnow()
        )


@strawberry.type
class Mutation:
    """GraphQL mutations."""
    
    @strawberry.field
    async def login(self, info, input: LoginInput) -> AuthPayload:
        """User login."""
        async for session in get_async_session():
            # Find user by email
            stmt = select(UserModel).where(UserModel.email == input.email) \
                .options(selectinload(UserModel.tenant))
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user or not jwt_handler.verify_password(input.password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials"
                )
            
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Account is disabled"
                )
            
            # Generate tokens
            access_token = jwt_handler.create_access_token(
                user.id,
                user.tenant_id,
                user.email,
                user.tenant.subscription_tier
            )
            refresh_token = jwt_handler.create_refresh_token(user.id, user.tenant_id)
            
            return AuthPayload(
                access_token=access_token,
                refresh_token=refresh_token,
                user=User(**user.to_dict()),
                expires_in=jwt_handler.access_token_expire_minutes * 60
            )
    
    @strawberry.field
    async def register(self, info, input: RegisterInput) -> AuthPayload:
        """User registration."""
        async for session in get_async_session():
            # Find tenant by domain
            tenant_stmt = select(TenantModel).where(TenantModel.domain == input.tenant_domain)
            tenant_result = await session.execute(tenant_stmt)
            tenant = tenant_result.scalar_one_or_none()
            
            if not tenant:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tenant not found"
                )
            
            # Check if user already exists
            user_stmt = select(UserModel).where(
                and_(
                    UserModel.email == input.email,
                    UserModel.tenant_id == tenant.id
                )
            )
            existing_user = await session.execute(user_stmt)
            if existing_user.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User already exists"
                )
            
            # Create new user
            password_hash = jwt_handler.hash_password(input.password)
            new_user = UserModel(
                tenant_id=tenant.id,
                email=input.email,
                username=input.username,
                password_hash=password_hash,
                is_active=True,
                is_verified=False
            )
            
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)
            
            # Generate tokens
            access_token = jwt_handler.create_access_token(
                new_user.id,
                new_user.tenant_id,
                new_user.email,
                tenant.subscription_tier
            )
            refresh_token = jwt_handler.create_refresh_token(new_user.id, new_user.tenant_id)
            
            return AuthPayload(
                access_token=access_token,
                refresh_token=refresh_token,
                user=User(**new_user.to_dict()),
                expires_in=jwt_handler.access_token_expire_minutes * 60
            )
    
    @strawberry.field
    @require_auth
    async def record_interaction(self, info, input: InteractionInput) -> Interaction:
        """Record user interaction."""
        # Check rate limits
        rate_limit_info = await graphql_rate_limiter.check_graphql_rate_limit(
            info.context.request,
            "mutation",
            "recordInteraction",
            info.context.user_id,
            info.context.tenant_id,
            info.context.subscription_tier
        )
        
        if rate_limit_info and "error" in rate_limit_info:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=rate_limit_info["error"]
            )
        
        # Verify item belongs to tenant
        item = await info.context.dataloaders.item_loader.load(input.item_id)
        if not item or item.tenant_id != info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        async for session in get_async_session():
            interaction = InteractionModel(
                tenant_id=info.context.tenant_id,
                user_id=info.context.user_id,
                item_id=input.item_id,
                interaction_type=input.interaction_type,
                interaction_value=input.interaction_value or 1.0,
                session_id=input.session_id,
                context=input.context or {}
            )
            
            session.add(interaction)
            await session.commit()
            await session.refresh(interaction)
            
            # Invalidate relevant caches
            await cache_manager.invalidate_user_cache(info.context.user_id)
            
            return Interaction(**interaction.to_dict())
    
    @strawberry.field
    @require_auth
    async def rate_item(self, info, input: RatingInput) -> Rating:
        """Rate an item."""
        # Verify item belongs to tenant
        item = await info.context.dataloaders.item_loader.load(input.item_id)
        if not item or item.tenant_id != info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        async for session in get_async_session():
            # Check if rating already exists
            existing_stmt = select(RatingModel).where(
                and_(
                    RatingModel.user_id == info.context.user_id,
                    RatingModel.item_id == input.item_id,
                    RatingModel.tenant_id == info.context.tenant_id
                )
            )
            existing_rating = await session.execute(existing_stmt)
            existing = existing_rating.scalar_one_or_none()
            
            if existing:
                # Update existing rating
                existing.rating = input.rating
                existing.review = input.review
                await session.commit()
                rating = existing
            else:
                # Create new rating
                rating = RatingModel(
                    tenant_id=info.context.tenant_id,
                    user_id=info.context.user_id,
                    item_id=input.item_id,
                    rating=input.rating,
                    review=input.review
                )
                session.add(rating)
                await session.commit()
                await session.refresh(rating)
            
            # Invalidate relevant caches
            await cache_manager.invalidate_user_cache(info.context.user_id)
            await cache_manager.invalidate_item_cache(input.item_id)
            
            return Rating(**rating.to_dict())
    
    @strawberry.field
    @require_auth
    async def create_item(self, info, input: ItemInput) -> Item:
        """Create a new item."""
        async for session in get_async_session():
            item = ItemModel(
                tenant_id=info.context.tenant_id,
                title=input.title,
                description=input.description,
                category=input.category,
                tags=input.tags or [],
                metadata=input.metadata or {},
                content_features=input.content_features or {},
                is_active=True,
                popularity_score=0.0
            )
            
            session.add(item)
            await session.commit()
            await session.refresh(item)
            
            return Item(**item.to_dict())


# Helper functions
async def _train_recommendation_engine(engine, tenant_id: uuid.UUID):
    """Train the recommendation engine with tenant data."""
    async for session in get_async_session():
        # Get interactions
        interactions_stmt = select(InteractionModel).where(
            InteractionModel.tenant_id == tenant_id
        )
        interactions_result = await session.execute(interactions_stmt)
        interactions = interactions_result.scalars().all()
        
        # Get items
        items_stmt = select(ItemModel).where(ItemModel.tenant_id == tenant_id)
        items_result = await session.execute(items_stmt)
        items = items_result.scalars().all()
        
        # Convert to dicts
        interactions_data = [interaction.to_dict() for interaction in interactions]
        items_data = [item.to_dict() for item in items]
        
        # Train engine
        await engine.train(interactions_data, items_data)


async def _save_recommendation_history(
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    algorithm: str,
    item_ids: List[str],
    scores: List[float],
    response_time_ms: float
):
    """Save recommendation to history."""
    async for session in get_async_session():
        history = RecommendationHistoryModel(
            tenant_id=tenant_id,
            user_id=user_id,
            algorithm=algorithm,
            recommended_items=item_ids,
            scores=scores,
            response_time_ms=response_time_ms
        )
        
        session.add(history)
        await session.commit()