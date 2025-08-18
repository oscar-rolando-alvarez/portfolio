"""DataLoader implementations for N+1 query optimization."""
import uuid
from typing import List, Dict, Any, Optional
from aiodataloader import DataLoader
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from app.database import get_async_session
from app.models import User, Item, Interaction, Rating, Tenant, RecommendationHistory
from app.cache import cache_manager


class UserDataLoader(DataLoader):
    """DataLoader for User entities."""
    
    async def batch_load_fn(self, user_ids: List[uuid.UUID]) -> List[Optional[User]]:
        """Batch load users by IDs."""
        # Check cache first
        cached_users = {}
        uncached_ids = []
        
        for user_id in user_ids:
            cached_user = await cache_manager.get_user_data(user_id)
            if cached_user:
                cached_users[user_id] = cached_user
            else:
                uncached_ids.append(user_id)
        
        # Fetch uncached users from database
        users_dict = {}
        if uncached_ids:
            async for session in get_async_session():
                stmt = select(User).where(User.id.in_(uncached_ids))
                result = await session.execute(stmt)
                users = result.scalars().all()
                
                for user in users:
                    users_dict[user.id] = user
                    # Cache user data
                    await cache_manager.set_user_data(user.id, user.to_dict())
        
        # Combine cached and fetched users
        all_users = {**cached_users, **users_dict}
        
        # Return users in the same order as requested IDs
        return [all_users.get(user_id) for user_id in user_ids]


class ItemDataLoader(DataLoader):
    """DataLoader for Item entities."""
    
    async def batch_load_fn(self, item_ids: List[uuid.UUID]) -> List[Optional[Item]]:
        """Batch load items by IDs."""
        # Check cache first
        cached_items = {}
        uncached_ids = []
        
        for item_id in item_ids:
            cached_item = await cache_manager.get_item_data(item_id)
            if cached_item:
                cached_items[item_id] = cached_item
            else:
                uncached_ids.append(item_id)
        
        # Fetch uncached items from database
        items_dict = {}
        if uncached_ids:
            async for session in get_async_session():
                stmt = select(Item).where(Item.id.in_(uncached_ids))
                result = await session.execute(stmt)
                items = result.scalars().all()
                
                for item in items:
                    items_dict[item.id] = item
                    # Cache item data
                    await cache_manager.set_item_data(item.id, item.to_dict())
        
        # Combine cached and fetched items
        all_items = {**cached_items, **items_dict}
        
        # Return items in the same order as requested IDs
        return [all_items.get(item_id) for item_id in item_ids]


class TenantDataLoader(DataLoader):
    """DataLoader for Tenant entities."""
    
    async def batch_load_fn(self, tenant_ids: List[uuid.UUID]) -> List[Optional[Tenant]]:
        """Batch load tenants by IDs."""
        async for session in get_async_session():
            stmt = select(Tenant).where(Tenant.id.in_(tenant_ids))
            result = await session.execute(stmt)
            tenants = result.scalars().all()
            
            tenants_dict = {tenant.id: tenant for tenant in tenants}
            
            # Return tenants in the same order as requested IDs
            return [tenants_dict.get(tenant_id) for tenant_id in tenant_ids]


class UserInteractionsDataLoader(DataLoader):
    """DataLoader for User interactions."""
    
    def __init__(self, interaction_type: Optional[str] = None):
        super().__init__()
        self.interaction_type = interaction_type
    
    async def batch_load_fn(self, user_ids: List[uuid.UUID]) -> List[List[Interaction]]:
        """Batch load user interactions."""
        # Check cache first
        cached_interactions = {}
        uncached_ids = []
        
        for user_id in user_ids:
            cached = await cache_manager.get_user_interactions(user_id, self.interaction_type)
            if cached:
                cached_interactions[user_id] = cached
            else:
                uncached_ids.append(user_id)
        
        # Fetch uncached interactions from database
        interactions_dict = {user_id: [] for user_id in user_ids}
        
        if uncached_ids:
            async for session in get_async_session():
                stmt = select(Interaction).where(Interaction.user_id.in_(uncached_ids))
                
                if self.interaction_type:
                    stmt = stmt.where(Interaction.interaction_type == self.interaction_type)
                
                stmt = stmt.options(selectinload(Interaction.item))
                result = await session.execute(stmt)
                interactions = result.scalars().all()
                
                # Group interactions by user
                for interaction in interactions:
                    if interaction.user_id not in interactions_dict:
                        interactions_dict[interaction.user_id] = []
                    interactions_dict[interaction.user_id].append(interaction)
                
                # Cache the results
                for user_id, user_interactions in interactions_dict.items():
                    if user_id in uncached_ids:
                        interaction_dicts = [interaction.to_dict() for interaction in user_interactions]
                        await cache_manager.set_user_interactions(
                            user_id, interaction_dicts, self.interaction_type
                        )
        
        # Combine cached and fetched interactions
        for user_id, cached in cached_interactions.items():
            interactions_dict[user_id] = cached
        
        # Return interactions in the same order as requested user IDs
        return [interactions_dict.get(user_id, []) for user_id in user_ids]


class UserRatingsDataLoader(DataLoader):
    """DataLoader for User ratings."""
    
    async def batch_load_fn(self, user_ids: List[uuid.UUID]) -> List[List[Rating]]:
        """Batch load user ratings."""
        async for session in get_async_session():
            stmt = select(Rating).where(Rating.user_id.in_(user_ids)) \
                .options(selectinload(Rating.item))
            result = await session.execute(stmt)
            ratings = result.scalars().all()
            
            # Group ratings by user
            ratings_dict = {user_id: [] for user_id in user_ids}
            for rating in ratings:
                if rating.user_id not in ratings_dict:
                    ratings_dict[rating.user_id] = []
                ratings_dict[rating.user_id].append(rating)
            
            # Return ratings in the same order as requested user IDs
            return [ratings_dict.get(user_id, []) for user_id in user_ids]


class ItemInteractionsDataLoader(DataLoader):
    """DataLoader for Item interactions."""
    
    def __init__(self, interaction_type: Optional[str] = None):
        super().__init__()
        self.interaction_type = interaction_type
    
    async def batch_load_fn(self, item_ids: List[uuid.UUID]) -> List[List[Interaction]]:
        """Batch load item interactions."""
        async for session in get_async_session():
            stmt = select(Interaction).where(Interaction.item_id.in_(item_ids))
            
            if self.interaction_type:
                stmt = stmt.where(Interaction.interaction_type == self.interaction_type)
            
            stmt = stmt.options(selectinload(Interaction.user))
            result = await session.execute(stmt)
            interactions = result.scalars().all()
            
            # Group interactions by item
            interactions_dict = {item_id: [] for item_id in item_ids}
            for interaction in interactions:
                if interaction.item_id not in interactions_dict:
                    interactions_dict[interaction.item_id] = []
                interactions_dict[interaction.item_id].append(interaction)
            
            # Return interactions in the same order as requested item IDs
            return [interactions_dict.get(item_id, []) for item_id in item_ids]


class ItemRatingsDataLoader(DataLoader):
    """DataLoader for Item ratings."""
    
    async def batch_load_fn(self, item_ids: List[uuid.UUID]) -> List[List[Rating]]:
        """Batch load item ratings."""
        async for session in get_async_session():
            stmt = select(Rating).where(Rating.item_id.in_(item_ids)) \
                .options(selectinload(Rating.user))
            result = await session.execute(stmt)
            ratings = result.scalars().all()
            
            # Group ratings by item
            ratings_dict = {item_id: [] for item_id in item_ids}
            for rating in ratings:
                if rating.item_id not in ratings_dict:
                    ratings_dict[rating.item_id] = []
                ratings_dict[rating.item_id].append(rating)
            
            # Return ratings in the same order as requested item IDs
            return [ratings_dict.get(item_id, []) for item_id in item_ids]


class RecommendationHistoryDataLoader(DataLoader):
    """DataLoader for recommendation history."""
    
    def __init__(self, algorithm: Optional[str] = None):
        super().__init__()
        self.algorithm = algorithm
    
    async def batch_load_fn(self, user_ids: List[uuid.UUID]) -> List[List[RecommendationHistory]]:
        """Batch load recommendation history."""
        async for session in get_async_session():
            stmt = select(RecommendationHistory).where(RecommendationHistory.user_id.in_(user_ids))
            
            if self.algorithm:
                stmt = stmt.where(RecommendationHistory.algorithm == self.algorithm)
            
            stmt = stmt.order_by(RecommendationHistory.created_at.desc())
            result = await session.execute(stmt)
            histories = result.scalars().all()
            
            # Group histories by user
            histories_dict = {user_id: [] for user_id in user_ids}
            for history in histories:
                if history.user_id not in histories_dict:
                    histories_dict[history.user_id] = []
                histories_dict[history.user_id].append(history)
            
            # Return histories in the same order as requested user IDs
            return [histories_dict.get(user_id, []) for user_id in user_ids]


class PopularItemsDataLoader(DataLoader):
    """DataLoader for popular items by category."""
    
    async def batch_load_fn(self, categories: List[str]) -> List[List[Item]]:
        """Batch load popular items by category."""
        # Check cache first
        cached_popular = {}
        uncached_categories = []
        
        for category in categories:
            cached = await cache_manager.get_popular_items(None, category)  # Tenant agnostic for now
            if cached:
                cached_popular[category] = cached
            else:
                uncached_categories.append(category)
        
        # Fetch uncached popular items from database
        popular_dict = {category: [] for category in categories}
        
        if uncached_categories:
            async for session in get_async_session():
                for category in uncached_categories:
                    stmt = select(Item).where(Item.category == category) \
                        .order_by(Item.popularity_score.desc()) \
                        .limit(100)
                    
                    result = await session.execute(stmt)
                    items = result.scalars().all()
                    popular_dict[category] = items
                    
                    # Cache the results
                    item_dicts = [item.to_dict() for item in items]
                    await cache_manager.set_popular_items(None, item_dicts, category)
        
        # Combine cached and fetched popular items
        for category, cached in cached_popular.items():
            popular_dict[category] = cached
        
        # Return popular items in the same order as requested categories
        return [popular_dict.get(category, []) for category in categories]


class DataLoaderManager:
    """Manager for all DataLoaders to avoid N+1 queries."""
    
    def __init__(self):
        # Primary entity loaders
        self.user_loader = UserDataLoader()
        self.item_loader = ItemDataLoader()
        self.tenant_loader = TenantDataLoader()
        
        # Relationship loaders
        self.user_interactions_loader = UserInteractionsDataLoader()
        self.user_ratings_loader = UserRatingsDataLoader()
        self.item_interactions_loader = ItemInteractionsDataLoader()
        self.item_ratings_loader = ItemRatingsDataLoader()
        self.recommendation_history_loader = RecommendationHistoryDataLoader()
        
        # Specialized loaders
        self.popular_items_loader = PopularItemsDataLoader()
        
        # Interaction type specific loaders
        self.user_views_loader = UserInteractionsDataLoader("view")
        self.user_purchases_loader = UserInteractionsDataLoader("purchase")
        self.user_clicks_loader = UserInteractionsDataLoader("click")
    
    def clear_all(self):
        """Clear all DataLoader caches."""
        loaders = [
            self.user_loader,
            self.item_loader,
            self.tenant_loader,
            self.user_interactions_loader,
            self.user_ratings_loader,
            self.item_interactions_loader,
            self.item_ratings_loader,
            self.recommendation_history_loader,
            self.popular_items_loader,
            self.user_views_loader,
            self.user_purchases_loader,
            self.user_clicks_loader
        ]
        
        for loader in loaders:
            loader.clear_all()
    
    async def prime_user(self, user: User):
        """Prime the user loader with a user object."""
        self.user_loader.prime(user.id, user)
    
    async def prime_item(self, item: Item):
        """Prime the item loader with an item object."""
        self.item_loader.prime(item.id, item)
    
    async def prime_tenant(self, tenant: Tenant):
        """Prime the tenant loader with a tenant object."""
        self.tenant_loader.prime(tenant.id, tenant)