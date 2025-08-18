"""GraphQL subscriptions for real-time updates."""
import uuid
import asyncio
import json
from typing import AsyncGenerator, Optional, Dict, Any, List
from datetime import datetime
import strawberry
from strawberry.subscriptions import GRAPHQL_WS_PROTOCOL

from app.api.types import (
    RecommendationItem, Item, Interaction, Rating, PerformanceMetrics
)
from app.auth import require_auth
from app.cache import redis_client
from app.monitoring.metrics import metrics_collector


@strawberry.type
class Subscription:
    """GraphQL subscriptions."""
    
    @strawberry.subscription
    @require_auth
    async def recommendation_updates(
        self,
        info,
        algorithm: Optional[str] = "hybrid"
    ) -> AsyncGenerator[List[RecommendationItem], None]:
        """Subscribe to recommendation updates for the current user."""
        user_id = info.context.user_id
        tenant_id = info.context.tenant_id
        
        # Redis channel for user-specific recommendation updates
        channel = f"recommendations:{tenant_id}:{user_id}:{algorithm}"
        
        try:
            # Subscribe to Redis channel
            pubsub = redis_client._cluster.pubsub() if hasattr(redis_client, '_cluster') else None
            if not pubsub:
                return
            
            await pubsub.subscribe(channel)
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        # Parse recommendation data
                        data = json.loads(message['data'])
                        recommendations = []
                        
                        for item_data in data.get('items', []):
                            # Load item details
                            item = await info.context.dataloaders.item_loader.load(
                                uuid.UUID(item_data['item_id'])
                            )
                            if item:
                                recommendations.append(RecommendationItem(
                                    item=Item(**item.to_dict()),
                                    score=item_data['score'],
                                    reason=item_data.get('reason', ''),
                                    metadata=item_data.get('metadata')
                                ))
                        
                        yield recommendations
                        
                    except Exception as e:
                        # Log error but continue subscription
                        continue
                        
        except Exception:
            # Connection closed or error occurred
            return
        finally:
            if pubsub:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
    
    @strawberry.subscription
    @require_auth
    async def item_interactions(
        self,
        info,
        item_id: uuid.UUID
    ) -> AsyncGenerator[Interaction, None]:
        """Subscribe to real-time interactions for a specific item."""
        # Verify item belongs to tenant
        item = await info.context.dataloaders.item_loader.load(item_id)
        if not item or item.tenant_id != info.context.tenant_id:
            return
        
        # Redis channel for item-specific interactions
        channel = f"interactions:{info.context.tenant_id}:{item_id}"
        
        try:
            pubsub = redis_client._cluster.pubsub() if hasattr(redis_client, '_cluster') else None
            if not pubsub:
                return
            
            await pubsub.subscribe(channel)
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        # Parse interaction data
                        data = json.loads(message['data'])
                        
                        # Create interaction object
                        interaction = Interaction(
                            id=uuid.UUID(data['id']),
                            tenant_id=uuid.UUID(data['tenant_id']),
                            user_id=uuid.UUID(data['user_id']),
                            item_id=uuid.UUID(data['item_id']),
                            interaction_type=data['interaction_type'],
                            interaction_value=data['interaction_value'],
                            session_id=data.get('session_id'),
                            context=data.get('context', {}),
                            created_at=datetime.fromisoformat(data['created_at'])
                        )
                        
                        yield interaction
                        
                    except Exception:
                        continue
                        
        except Exception:
            return
        finally:
            if pubsub:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
    
    @strawberry.subscription
    @require_auth
    async def user_activity(
        self,
        info
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Subscribe to current user's activity feed."""
        user_id = info.context.user_id
        tenant_id = info.context.tenant_id
        
        # Redis channel for user activity
        channel = f"activity:{tenant_id}:{user_id}"
        
        try:
            pubsub = redis_client._cluster.pubsub() if hasattr(redis_client, '_cluster') else None
            if not pubsub:
                return
            
            await pubsub.subscribe(channel)
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        # Parse activity data
                        data = json.loads(message['data'])
                        yield data
                        
                    except Exception:
                        continue
                        
        except Exception:
            return
        finally:
            if pubsub:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
    
    @strawberry.subscription
    @require_auth
    async def performance_metrics_stream(
        self,
        info,
        interval_seconds: int = 30
    ) -> AsyncGenerator[PerformanceMetrics, None]:
        """Subscribe to real-time performance metrics."""
        while True:
            try:
                # Get current metrics
                metrics = await metrics_collector.get_current_metrics()
                
                performance_metrics = PerformanceMetrics(
                    query_count=metrics.get("query_count", 0),
                    average_response_time=metrics.get("average_response_time", 0.0),
                    cache_hit_rate=metrics.get("cache_hit_rate", 0.0),
                    error_rate=metrics.get("error_rate", 0.0),
                    timestamp=datetime.utcnow()
                )
                
                yield performance_metrics
                
                # Wait for next interval
                await asyncio.sleep(interval_seconds)
                
            except Exception:
                # Connection closed or error occurred
                break
    
    @strawberry.subscription
    @require_auth
    async def similar_items_updates(
        self,
        info,
        item_id: uuid.UUID
    ) -> AsyncGenerator[List[RecommendationItem], None]:
        """Subscribe to updates for similar items."""
        # Verify item belongs to tenant
        item = await info.context.dataloaders.item_loader.load(item_id)
        if not item or item.tenant_id != info.context.tenant_id:
            return
        
        # Redis channel for similar items updates
        channel = f"similar_items:{info.context.tenant_id}:{item_id}"
        
        try:
            pubsub = redis_client._cluster.pubsub() if hasattr(redis_client, '_cluster') else None
            if not pubsub:
                return
            
            await pubsub.subscribe(channel)
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        # Parse similar items data
                        data = json.loads(message['data'])
                        similar_items = []
                        
                        for item_data in data.get('items', []):
                            # Load item details
                            similar_item = await info.context.dataloaders.item_loader.load(
                                uuid.UUID(item_data['item_id'])
                            )
                            if similar_item:
                                similar_items.append(RecommendationItem(
                                    item=Item(**similar_item.to_dict()),
                                    score=item_data['score'],
                                    reason=item_data.get('reason', 'Similar item'),
                                    metadata=item_data.get('metadata')
                                ))
                        
                        yield similar_items
                        
                    except Exception:
                        continue
                        
        except Exception:
            return
        finally:
            if pubsub:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
    
    @strawberry.subscription
    @require_auth
    async def trending_items(
        self,
        info,
        category: Optional[str] = None,
        interval_seconds: int = 60
    ) -> AsyncGenerator[List[Item], None]:
        """Subscribe to trending items updates."""
        while True:
            try:
                # Get trending items from cache or calculate
                trending = await _get_trending_items(
                    info.context.tenant_id,
                    category,
                    limit=20
                )
                
                # Convert to GraphQL types
                trending_items = []
                for item_data in trending:
                    item = await info.context.dataloaders.item_loader.load(
                        uuid.UUID(item_data['id'])
                    )
                    if item:
                        trending_items.append(Item(**item.to_dict()))
                
                yield trending_items
                
                # Wait for next interval
                await asyncio.sleep(interval_seconds)
                
            except Exception:
                break


# WebSocket subscription helpers
class SubscriptionManager:
    """Manages WebSocket subscriptions and real-time updates."""
    
    def __init__(self):
        self.active_subscriptions: Dict[str, set] = {}
    
    async def publish_recommendation_update(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        algorithm: str,
        recommendations: List[Dict[str, Any]]
    ):
        """Publish recommendation update to subscribers."""
        channel = f"recommendations:{tenant_id}:{user_id}:{algorithm}"
        
        message = {
            'type': 'recommendation_update',
            'items': recommendations,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        try:
            await redis_client.publish(channel, json.dumps(message))
        except Exception:
            pass
    
    async def publish_interaction(
        self,
        interaction: Dict[str, Any]
    ):
        """Publish interaction to subscribers."""
        tenant_id = interaction['tenant_id']
        item_id = interaction['item_id']
        user_id = interaction['user_id']
        
        # Publish to item-specific channel
        item_channel = f"interactions:{tenant_id}:{item_id}"
        
        # Publish to user activity channel
        user_channel = f"activity:{tenant_id}:{user_id}"
        
        message = {
            'type': 'interaction',
            'data': interaction,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        try:
            await redis_client.publish(item_channel, json.dumps(interaction))
            await redis_client.publish(user_channel, json.dumps(message))
        except Exception:
            pass
    
    async def publish_similar_items_update(
        self,
        tenant_id: uuid.UUID,
        item_id: uuid.UUID,
        similar_items: List[Dict[str, Any]]
    ):
        """Publish similar items update."""
        channel = f"similar_items:{tenant_id}:{item_id}"
        
        message = {
            'type': 'similar_items_update',
            'items': similar_items,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        try:
            await redis_client.publish(channel, json.dumps(message))
        except Exception:
            pass


# Helper functions
async def _get_trending_items(
    tenant_id: uuid.UUID,
    category: Optional[str] = None,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """Get trending items for a tenant."""
    # This would implement actual trending calculation
    # For now, return cached popular items
    return await cache_manager.get_popular_items(tenant_id, category, limit) or []


# Global subscription manager
subscription_manager = SubscriptionManager()