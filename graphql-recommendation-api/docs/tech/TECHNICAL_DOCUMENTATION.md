# GraphQL Recommendation API - Technical Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [GraphQL API Architecture](#graphql-api-architecture)
3. [Microservices Design Patterns](#microservices-design-patterns)
4. [Recommendation Algorithms Implementation](#recommendation-algorithms-implementation)
5. [Vector Database Architecture](#vector-database-architecture)
6. [Distributed Caching with Redis Cluster](#distributed-caching-with-redis-cluster)
7. [Multi-Tenant System Design](#multi-tenant-system-design)
8. [DataLoader Pattern Implementation](#dataloader-pattern-implementation)
9. [Real-Time Subscriptions](#real-time-subscriptions)
10. [Authentication and Rate Limiting](#authentication-and-rate-limiting)
11. [Performance Metrics and Monitoring](#performance-metrics-and-monitoring)
12. [Testing Strategies](#testing-strategies)
13. [Deployment Architecture](#deployment-architecture)

## Architecture Overview

The GraphQL Recommendation API is a sophisticated, high-performance recommendation system built with modern Python technologies and designed for enterprise-scale deployments. The system combines multiple recommendation algorithms, real-time processing capabilities, and advanced caching strategies to deliver personalized recommendations through a unified GraphQL interface.

### Core Technologies Stack

- **Framework**: FastAPI with Strawberry GraphQL
- **Runtime**: Python 3.11 with AsyncIO
- **Database**: PostgreSQL with SQLAlchemy (async)
- **Caching**: Redis Cluster
- **Vector Database**: Qdrant/Pinecone/Weaviate (configurable)
- **Monitoring**: Prometheus + Grafana + Jaeger
- **Container Orchestration**: Docker + Kubernetes

### System Characteristics

- **Multi-tenant architecture** with tenant-level isolation
- **Horizontal scalability** through microservices patterns
- **Real-time capabilities** via WebSocket subscriptions
- **Advanced caching strategies** for sub-second response times
- **Multiple recommendation algorithms** with hybrid approaches
- **Comprehensive monitoring** and observability

## GraphQL API Architecture

### Core Schema Design

The GraphQL schema is designed around five main entity types:

```graphql
type User {
  id: UUID!
  tenant: Tenant!
  email: String!
  username: String!
  preferences: JSON
  interactions(type: String): [Interaction!]!
  ratings: [Rating!]!
}

type Item {
  id: UUID!
  tenant: Tenant!
  title: String!
  description: String
  category: String
  tags: JSON
  metadata: JSON
  averageRating: Float
  similarItems(topK: Int = 10): [SimilarItem!]!
}

type RecommendationResult {
  items: [RecommendationItem!]!
  algorithm: String!
  generatedAt: DateTime!
  responseTimeMs: Float!
  totalCount: Int!
  explanation: RecommendationExplanation
}
```

### Query Operations

#### Core Queries
- `me`: Current authenticated user
- `user(id: UUID)`: Specific user by ID
- `users(limit: Int, offset: Int)`: Paginated users list
- `item(id: UUID)`: Specific item by ID
- `items(category: String, search: String)`: Filtered items

#### Recommendation Queries
- `recommendations(options: RecommendationOptions)`: Primary recommendation endpoint
- `similarItems(itemId: UUID, topK: Int)`: Item-to-item similarity
- `rateLimitStatus`: Current rate limiting status
- `performanceMetrics`: System performance data

### Mutation Operations

#### Authentication
- `login(input: LoginInput)`: User authentication
- `register(input: RegisterInput)`: User registration

#### User Interactions
- `recordInteraction(input: InteractionInput)`: Track user behavior
- `rateItem(input: RatingInput)`: Submit item ratings
- `createItem(input: ItemInput)`: Create new items

### Subscription Operations

#### Real-time Updates
- `recommendationUpdates(algorithm: String)`: Live recommendation changes
- `itemInteractions(itemId: UUID)`: Real-time interaction tracking
- `userActivity`: User-specific activity feed
- `performanceMetricsStream`: Live system metrics
- `trendingItems(category: String)`: Real-time trending data

### Advanced GraphQL Features

#### Custom Scalars
```python
@strawberry.scalar
class UUID:
    def serialize(value: uuid.UUID) -> str:
        return str(value)
    
    def parse_value(value: str) -> uuid.UUID:
        return uuid.UUID(value)
```

#### Input Validation
```python
@strawberry.input
class RecommendationOptions:
    algorithm: Optional[str] = "hybrid"
    num_recommendations: Optional[int] = 10
    diversify: Optional[bool] = True
    explain: Optional[bool] = False
    filters: Optional[RecommendationFilter] = None
```

## Microservices Design Patterns

### Service Decomposition

The system follows a modular microservices architecture with clear separation of concerns:

#### Core Services
1. **API Gateway Service** (`app.main`)
   - FastAPI application with GraphQL endpoint
   - Request routing and load balancing
   - CORS and security middleware

2. **Authentication Service** (`app.auth`)
   - JWT token management
   - User authentication and authorization
   - Tenant-based access control

3. **Recommendation Service** (`app.recommendation`)
   - Multiple algorithm implementations
   - Model training and inference
   - Hybrid recommendation logic

4. **Cache Service** (`app.cache`)
   - Redis Cluster management
   - Multi-level caching strategies
   - Cache invalidation patterns

5. **Vector Service** (`app.utils.vector_db`)
   - Vector database abstraction
   - Similarity search operations
   - Multiple provider support

6. **Monitoring Service** (`app.monitoring`)
   - Metrics collection and aggregation
   - Performance tracking
   - Alert management

### Design Patterns Implementation

#### Repository Pattern
```python
class UserRepository:
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        async for session in get_async_session():
            stmt = select(User).where(User.id == user_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
```

#### Factory Pattern
```python
class RecommendationEngineFactory:
    @staticmethod
    def create_engine(algorithm: str) -> BaseRecommendationEngine:
        if algorithm == "collaborative":
            return UserBasedCollaborativeFiltering()
        elif algorithm == "content_based":
            return ContentBasedRecommendationEngine()
        elif algorithm == "hybrid":
            return WeightedHybridRecommendationEngine()
```

#### Strategy Pattern
```python
class WeightedHybridRecommendationEngine:
    async def _calculate_adaptive_weights(self, user_id: UUID) -> Dict[str, float]:
        # Dynamic weight calculation based on data availability
        has_cf_data = user_id in self.user_cf.user_mapping
        has_content_data = user_id in self.content_based.user_profiles
        
        # Adaptive weight redistribution
        weights = self._redistribute_weights(has_cf_data, has_content_data)
        return weights
```

#### Observer Pattern
```python
class SubscriptionManager:
    async def publish_recommendation_update(
        self, tenant_id: UUID, user_id: UUID, 
        algorithm: str, recommendations: List[Dict]
    ):
        channel = f"recommendations:{tenant_id}:{user_id}:{algorithm}"
        await redis_client.publish(channel, json.dumps(recommendations))
```

## Recommendation Algorithms Implementation

### Algorithm Architecture

The recommendation system implements multiple algorithms with a unified interface:

```python
class BaseRecommendationEngine(ABC):
    @abstractmethod
    async def train(self, interactions: List[Dict], **kwargs):
        pass
    
    @abstractmethod
    async def recommend(self, context: RecommendationContext) -> List[RecommendationItem]:
        pass
    
    @abstractmethod
    async def get_item_similarity(self, item_id: UUID, top_k: int) -> List[Tuple[UUID, float]]:
        pass
```

### 1. Collaborative Filtering

#### User-Based Collaborative Filtering
```python
class UserBasedCollaborativeFiltering(BaseRecommendationEngine):
    def __init__(self, k_neighbors: int = 50, min_interactions: int = 5):
        self.k_neighbors = k_neighbors
        self.min_interactions = min_interactions
        self.user_similarity_matrix = None
        self.user_item_matrix = None
```

**Implementation Details:**
- **Similarity Calculation**: Cosine similarity between user vectors
- **Neighborhood Selection**: Top-K similar users
- **Prediction**: Weighted average of neighbor ratings
- **Cold Start Handling**: Popular item fallback

#### Item-Based Collaborative Filtering
```python
class ItemBasedCollaborativeFiltering(BaseRecommendationEngine):
    async def train(self, interactions: List[Dict], **kwargs):
        # Build user-item matrix
        user_item_matrix = self._build_matrix(interactions)
        # Compute item-item similarity (transpose for item similarity)
        self.item_similarity_matrix = cosine_similarity(user_item_matrix.T)
```

**Key Features:**
- **Stability**: More stable than user-based CF
- **Scalability**: Better performance with large user bases
- **Explainability**: Clear similarity reasoning

### 2. Content-Based Filtering

```python
class ContentBasedRecommendationEngine(BaseRecommendationEngine):
    def __init__(self, text_weight: float = 0.6, categorical_weight: float = 0.3, numerical_weight: float = 0.1):
        self.tfidf_vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
        self.label_encoders = {}
        self.scaler = StandardScaler()
```

**Feature Engineering:**
1. **Text Features**: TF-IDF vectorization of title, description, tags
2. **Categorical Features**: One-hot encoding of categories
3. **Numerical Features**: Standardized numerical metadata
4. **Feature Combination**: Weighted concatenation

**User Profile Construction:**
```python
async def _build_user_profiles(self, interactions_df):
    for user_id in interactions_df['user_id'].unique():
        user_interactions = interactions_df[interactions_df['user_id'] == user_id]
        # Weighted average of interacted item features
        item_features = self.combined_features_matrix[interacted_items]
        user_profile = np.average(item_features, axis=0, weights=weights)
        self.user_profiles[user_id] = user_profile
```

### 3. Matrix Factorization

#### SVD Implementation
```python
class SVDRecommendationEngine(BaseRecommendationEngine):
    def __init__(self, n_factors: int = 100, n_epochs: int = 20):
        self.model = SVD(n_factors=n_factors, n_epochs=n_epochs, 
                        lr_all=0.005, reg_all=0.02, random_state=42)
```

#### Implicit Feedback Model
```python
class ImplicitMFRecommendationEngine(BaseRecommendationEngine):
    async def train(self, interactions: List[Dict], **kwargs):
        # Convert to sparse matrix format
        self.user_item_matrix = csr_matrix((data, (row, col)), shape=(n_users, n_items))
        # Train ALS model
        self.model = implicit.als.AlternatingLeastSquares(
            factors=self.factors, iterations=self.iterations,
            regularization=self.regularization, random_state=42
        )
        self.model.fit(self.user_item_matrix)
```

### 4. Hybrid Approaches

#### Weighted Hybrid Engine
```python
class WeightedHybridRecommendationEngine(BaseRecommendationEngine):
    async def recommend(self, context: RecommendationContext) -> List[RecommendationItem]:
        weights = await self._calculate_adaptive_weights(context.user_id)
        all_recommendations = {}
        
        # Combine recommendations from multiple engines
        for engine, weight in zip(self.engines, weights.values()):
            if weight > 0:
                engine_recs = await engine.recommend(context)
                self._merge_recommendations(all_recommendations, engine_recs, weight)
```

**Adaptive Weight Calculation:**
- Data availability assessment
- Performance-based adjustments
- User interaction history analysis

#### Switching Hybrid Engine
```python
class SwitchingHybridRecommendationEngine(BaseRecommendationEngine):
    async def _choose_method(self, user_id: UUID) -> str:
        user_interaction_count = self._get_interaction_count(user_id)
        
        if user_interaction_count >= self.min_interactions_for_cf:
            return "collaborative_filtering"
        elif user_id in self.content_based.user_profiles:
            return "content_based"
        else:
            return "matrix_factorization"
```

### Algorithm Performance Optimization

#### Caching Strategies
```python
@cache_result("similarity_matrix", ttl=86400)  # 24 hours
async def compute_similarity_matrix(self, algorithm: str):
    # Expensive computation cached for reuse
    return similarity_matrix
```

#### Parallel Processing
```python
async def batch_recommendations(self, user_contexts: List[RecommendationContext]):
    tasks = [self.recommend(context) for context in user_contexts]
    return await asyncio.gather(*tasks)
```

## Vector Database Architecture

### Multi-Provider Abstraction

The system supports multiple vector database providers through a unified interface:

```python
class BaseVectorDB(ABC):
    @abstractmethod
    async def search_similar(self, collection: str, query_vector: List[float], 
                           top_k: int, filter_conditions: Dict) -> List[Dict]:
        pass
```

### Supported Providers

#### 1. Qdrant Integration
```python
class QdrantVectorDB(BaseVectorDB):
    async def create_collection(self, name: str, dimension: int, **kwargs):
        self.client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(size=dimension, distance=models.Distance.COSINE)
        )
    
    async def upsert_vectors(self, collection: str, vectors: List[Dict]):
        points = [models.PointStruct(id=v['id'], vector=v['vector'], 
                                   payload=v.get('metadata', {})) for v in vectors]
        self.client.upsert(collection_name=collection, points=points)
```

#### 2. Pinecone Integration
```python
class PineconeVectorDB(BaseVectorDB):
    async def search_similar(self, collection: str, query_vector: List[float], 
                           top_k: int, filter_conditions: Dict) -> List[Dict]:
        results = self.index.query(vector=query_vector, top_k=top_k, 
                                 include_metadata=True, filter=filter_conditions)
        return [{'id': m['id'], 'score': m['score'], 'metadata': m.get('metadata', {})} 
                for m in results['matches']]
```

#### 3. Weaviate Integration
```python
class WeaviateVectorDB(BaseVectorDB):
    async def search_similar(self, collection: str, query_vector: List[float], 
                           top_k: int, filter_conditions: Dict) -> List[Dict]:
        near_vector = {"vector": query_vector}
        query = self.client.query.get(collection, ["item_id", "metadata"]) \
            .with_near_vector(near_vector).with_limit(top_k)
        
        if filter_conditions:
            query = query.with_where(filter_conditions)
        
        return query.do()
```

### Vector Operations

#### Item Vector Storage
```python
class VectorDBManager:
    async def store_item_vectors(self, items: List[Dict], collection: str = "items"):
        vectors = []
        for item in items:
            if 'vector' in item:
                vectors.append({
                    'id': item['id'],
                    'vector': item['vector'],
                    'metadata': {
                        'title': item.get('title', ''),
                        'category': item.get('category', ''),
                        'tenant_id': str(item.get('tenant_id', ''))
                    }
                })
        await self.db.upsert_vectors(collection, vectors)
```

#### Similarity Search
```python
async def find_similar_items(self, query_vector: List[float], top_k: int = 10, 
                           tenant_id: UUID = None, category: str = None) -> List[Dict]:
    filter_conditions = {}
    if tenant_id:
        filter_conditions['tenant_id'] = str(tenant_id)
    if category:
        filter_conditions['category'] = category
    
    return await self.db.search_similar("items", query_vector, top_k, filter_conditions)
```

### Vector Generation Pipeline

#### Content Feature Extraction
```python
async def generate_item_vectors(self, items: List[Dict]) -> List[Dict]:
    for item in items:
        # Combine text features
        text_content = f"{item.get('title', '')} {item.get('description', '')} {' '.join(item.get('tags', []))}"
        # Generate embeddings using TF-IDF or transformer models
        vector = await self._text_to_vector(text_content)
        item['vector'] = vector.tolist()
    return items
```

## Distributed Caching with Redis Cluster

### Redis Cluster Architecture

The system uses a 3-node Redis Cluster for high availability and horizontal scaling:

```yaml
# Docker Compose Configuration
redis-node-1:
  image: redis:7-alpine
  command: redis-server --port 7000 --cluster-enabled yes 
           --cluster-config-file nodes-7000.conf --cluster-node-timeout 5000

redis-node-2:
  image: redis:7-alpine
  command: redis-server --port 7001 --cluster-enabled yes 
           --cluster-config-file nodes-7001.conf --cluster-node-timeout 5000

redis-node-3:
  image: redis:7-alpine
  command: redis-server --port 7002 --cluster-enabled yes 
           --cluster-config-file nodes-7002.conf --cluster-node-timeout 5000
```

### Redis Client Implementation

```python
class RedisClusterClient:
    async def connect(self):
        startup_nodes = [{"host": host, "port": port} for host, port in self.parse_nodes()]
        self._cluster = RedisCluster(
            startup_nodes=startup_nodes,
            decode_responses=True,
            skip_full_coverage_check=True,
            retry_on_timeout=True,
            health_check_interval=30
        )
```

### Caching Strategies

#### 1. Multi-Level Caching
```python
class CacheManager:
    def __init__(self):
        self.recommendation_ttl = 1800  # 30 minutes
        self.user_data_ttl = 7200      # 2 hours
        self.item_data_ttl = 14400     # 4 hours
        self.similarity_matrix_ttl = 86400  # 24 hours
```

#### 2. Cache Key Generation
```python
def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
    key_parts = [str(prefix)]
    key_parts.extend([str(arg) for arg in args])
    key_parts.extend([f"{k}:{v}" for k, v in sorted(kwargs.items())])
    key_string = "|".join(key_parts)
    
    # Hash long keys to prevent Redis key length issues
    if len(key_string) > 200:
        key_hash = hashlib.md5(key_string.encode()).hexdigest()
        return f"{prefix}:hash:{key_hash}"
    
    return key_string.replace(" ", "_")
```

#### 3. Cache Operations

**Recommendation Caching:**
```python
async def get_recommendations(self, user_id: UUID, algorithm: str, 
                            num_items: int = 10, **params) -> Optional[List[Dict]]:
    cache_key = self._generate_cache_key("rec", user_id, algorithm, num_items, **params)
    return await redis_client.get(cache_key)

async def set_recommendations(self, user_id: UUID, algorithm: str, 
                            recommendations: List[Dict], **params) -> bool:
    cache_key = self._generate_cache_key("rec", user_id, algorithm, len(recommendations), **params)
    return await redis_client.set(cache_key, recommendations, expire=self.recommendation_ttl)
```

**DataLoader Integration:**
```python
class UserDataLoader(DataLoader):
    async def batch_load_fn(self, user_ids: List[UUID]) -> List[Optional[User]]:
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
        if uncached_ids:
            users = await self._fetch_from_db(uncached_ids)
            for user in users:
                await cache_manager.set_user_data(user.id, user.to_dict())
```

#### 4. Cache Invalidation

**User Cache Invalidation:**
```python
async def invalidate_user_cache(self, user_id: UUID):
    patterns = [
        f"user:{user_id}",
        f"interactions:{user_id}*",
        f"rec:{user_id}*"
    ]
    
    tasks = []
    for pattern in patterns:
        if "*" not in pattern:
            tasks.append(redis_client.delete(pattern))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
```

### Cache Performance Optimization

#### 1. Pipeline Operations
```python
async def batch_cache_operations(self, operations: List[Dict]):
    pipe = self.redis._cluster.pipeline()
    for op in operations:
        if op['type'] == 'set':
            pipe.set(op['key'], op['value'], ex=op.get('ttl'))
        elif op['type'] == 'get':
            pipe.get(op['key'])
    
    return await pipe.execute()
```

#### 2. Compression for Large Objects
```python
async def set_large_object(self, key: str, value: Any, expire: int = None):
    # Compress large objects to reduce memory usage
    if len(json.dumps(value)) > 1024:  # 1KB threshold
        compressed_value = gzip.compress(json.dumps(value).encode())
        await redis_client.set(f"{key}:compressed", compressed_value, expire)
    else:
        await redis_client.set(key, value, expire)
```

## Multi-Tenant System Design

### Tenant Isolation Architecture

The system implements strict tenant isolation at multiple levels:

#### 1. Database Level Isolation
```python
class TenantAwareModel(BaseModel):
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    
    @hybrid_property
    def tenant_filter(cls):
        return cls.tenant_id == current_tenant_id()
```

#### 2. GraphQL Context Isolation
```python
@strawberry.type
class Context:
    user_id: Optional[UUID] = None
    tenant_id: Optional[UUID] = None
    subscription_tier: str = "basic"
    is_authenticated: bool = False
    dataloaders: Optional[DataLoaderManager] = None

async def get_enhanced_context(request: Request, response: Response):
    auth_context = await get_context(request, response)
    auth_context.dataloaders = DataLoaderManager()
    return auth_context
```

#### 3. Tenant-Aware Queries
```python
@strawberry.field
@require_auth
async def users(self, info, limit: int = 10, offset: int = 0) -> List[User]:
    async for session in get_async_session():
        stmt = select(UserModel).where(
            UserModel.tenant_id == info.context.tenant_id
        ).limit(limit).offset(offset)
        
        result = await session.execute(stmt)
        return [User(**user.to_dict()) for user in result.scalars().all()]
```

### Tenant Configuration Management

#### 1. Tenant Settings
```python
class Tenant(Base):
    __tablename__ = "tenants"
    
    name = Column(String(100), nullable=False)
    domain = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    subscription_tier = Column(String(50), default="basic")
```

#### 2. Tenant-Specific Rate Limiting
```python
async def check_rate_limit(self, request: Request, user_id: UUID = None, 
                         tenant_id: UUID = None, subscription_tier: str = "basic"):
    # Tenant-wide rate limiting
    if tenant_id:
        tenant_limit_str = "50000/hour"  # Base tenant limit
        if subscription_tier == "enterprise":
            tenant_limit_str = "200000/hour"
        
        tenant_key = f"tenant:{tenant_id}"
        tenant_limited, tenant_info = await self._is_rate_limited(tenant_key, tenant_limit_str)
        
        if tenant_limited:
            return {"error": "Tenant rate limit exceeded", **tenant_info}
```

#### 3. Tenant-Aware Caching
```python
async def get_recommendations(self, user_id: UUID, algorithm: str, tenant_id: UUID):
    cache_key = f"rec:{tenant_id}:{user_id}:{algorithm}"
    return await redis_client.get(cache_key)
```

### Multi-Tenant Data Processing

#### 1. Tenant-Scoped Training
```python
async def train_recommendation_engine(self, engine, tenant_id: UUID):
    async for session in get_async_session():
        # Get tenant-specific interactions
        interactions_stmt = select(InteractionModel).where(
            InteractionModel.tenant_id == tenant_id
        )
        interactions = await session.execute(interactions_stmt)
        
        # Get tenant-specific items
        items_stmt = select(ItemModel).where(ItemModel.tenant_id == tenant_id)
        items = await session.execute(items_stmt)
        
        # Train with tenant data only
        await engine.train(interactions.scalars().all(), items.scalars().all())
```

#### 2. Tenant Resource Allocation
```python
class TenantResourceManager:
    def __init__(self):
        self.resource_limits = {
            "basic": {"max_recommendations_per_hour": 1000, "max_items": 10000},
            "premium": {"max_recommendations_per_hour": 5000, "max_items": 50000},
            "enterprise": {"max_recommendations_per_hour": 20000, "max_items": 1000000}
        }
    
    async def check_resource_usage(self, tenant_id: UUID, subscription_tier: str):
        limits = self.resource_limits[subscription_tier]
        current_usage = await self._get_current_usage(tenant_id)
        return current_usage <= limits
```

## DataLoader Pattern Implementation

### N+1 Query Problem Solution

The DataLoader pattern prevents N+1 query problems by batching database requests:

```python
class DataLoader:
    def __init__(self, batch_load_fn, batch_size=100):
        self.batch_load_fn = batch_load_fn
        self.batch_size = batch_size
        self._cache = {}
        self._batch = []
        self._batch_promise = None
```

### Core DataLoader Implementations

#### 1. User DataLoader
```python
class UserDataLoader(DataLoader):
    async def batch_load_fn(self, user_ids: List[UUID]) -> List[Optional[User]]:
        # Check cache first
        cached_users = {}
        uncached_ids = []
        
        for user_id in user_ids:
            cached_user = await cache_manager.get_user_data(user_id)
            if cached_user:
                cached_users[user_id] = cached_user
            else:
                uncached_ids.append(user_id)
        
        # Fetch uncached users in single query
        users_dict = {}
        if uncached_ids:
            async for session in get_async_session():
                stmt = select(User).where(User.id.in_(uncached_ids))
                result = await session.execute(stmt)
                users = result.scalars().all()
                
                for user in users:
                    users_dict[user.id] = user
                    await cache_manager.set_user_data(user.id, user.to_dict())
        
        # Return users in requested order
        all_users = {**cached_users, **users_dict}
        return [all_users.get(user_id) for user_id in user_ids]
```

#### 2. Relationship DataLoaders
```python
class UserInteractionsDataLoader(DataLoader):
    def __init__(self, interaction_type: Optional[str] = None):
        super().__init__()
        self.interaction_type = interaction_type
    
    async def batch_load_fn(self, user_ids: List[UUID]) -> List[List[Interaction]]:
        async for session in get_async_session():
            stmt = select(Interaction).where(Interaction.user_id.in_(user_ids))
            
            if self.interaction_type:
                stmt = stmt.where(Interaction.interaction_type == self.interaction_type)
            
            result = await session.execute(stmt)
            interactions = result.scalars().all()
            
            # Group by user
            interactions_dict = {user_id: [] for user_id in user_ids}
            for interaction in interactions:
                interactions_dict[interaction.user_id].append(interaction)
            
            return [interactions_dict.get(user_id, []) for user_id in user_ids]
```

### DataLoader Manager

```python
class DataLoaderManager:
    def __init__(self):
        # Primary entity loaders
        self.user_loader = UserDataLoader()
        self.item_loader = ItemDataLoader()
        self.tenant_loader = TenantDataLoader()
        
        # Relationship loaders
        self.user_interactions_loader = UserInteractionsDataLoader()
        self.user_ratings_loader = UserRatingsDataLoader()
        self.item_interactions_loader = ItemInteractionsDataLoader()
        
        # Specialized loaders
        self.popular_items_loader = PopularItemsDataLoader()
        self.user_views_loader = UserInteractionsDataLoader("view")
        self.user_purchases_loader = UserInteractionsDataLoader("purchase")
    
    def clear_all(self):
        """Clear all DataLoader caches between requests."""
        for loader in [self.user_loader, self.item_loader, self.tenant_loader, 
                      self.user_interactions_loader, self.user_ratings_loader]:
            loader.clear_all()
```

### Usage in GraphQL Resolvers

```python
@strawberry.type
class User:
    @strawberry.field
    async def interactions(self, info, interaction_type: Optional[str] = None) -> List[Interaction]:
        if interaction_type:
            loader = getattr(info.context.dataloaders, f"user_{interaction_type}_loader", None)
            if loader:
                return await loader.load(self.id)
        return await info.context.dataloaders.user_interactions_loader.load(self.id)
    
    @strawberry.field
    async def tenant(self, info) -> Optional[Tenant]:
        return await info.context.dataloaders.tenant_loader.load(self.tenant_id)
```

### Performance Benefits

1. **Query Reduction**: Reduces N+1 queries to 1+1 queries
2. **Caching**: Automatic per-request caching
3. **Batching**: Groups multiple requests into single database queries
4. **Memory Efficiency**: Clears cache between requests

## Real-Time Subscriptions

### WebSocket Subscription Architecture

The system implements real-time updates using GraphQL subscriptions over WebSocket:

```python
@strawberry.type
class Subscription:
    @strawberry.subscription
    @require_auth
    async def recommendation_updates(
        self, info, algorithm: Optional[str] = "hybrid"
    ) -> AsyncGenerator[List[RecommendationItem], None]:
        user_id = info.context.user_id
        tenant_id = info.context.tenant_id
        channel = f"recommendations:{tenant_id}:{user_id}:{algorithm}"
        
        try:
            pubsub = redis_client._cluster.pubsub()
            await pubsub.subscribe(channel)
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    data = json.loads(message['data'])
                    yield [RecommendationItem(**item) for item in data.get('items', [])]
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
```

### Subscription Types

#### 1. Recommendation Updates
```python
@strawberry.subscription
async def recommendation_updates(self, info, algorithm: str) -> AsyncGenerator[List[RecommendationItem], None]:
    # Live recommendation changes when user behavior or item catalog changes
    pass
```

#### 2. Item Interactions
```python
@strawberry.subscription
async def item_interactions(self, info, item_id: UUID) -> AsyncGenerator[Interaction, None]:
    # Real-time tracking of interactions for specific items
    channel = f"interactions:{info.context.tenant_id}:{item_id}"
    # Implementation details...
```

#### 3. User Activity Feed
```python
@strawberry.subscription
async def user_activity(self, info) -> AsyncGenerator[Dict[str, Any], None]:
    # Personal activity feed for current user
    channel = f"activity:{info.context.tenant_id}:{info.context.user_id}"
    # Implementation details...
```

#### 4. Performance Metrics Stream
```python
@strawberry.subscription
async def performance_metrics_stream(
    self, info, interval_seconds: int = 30
) -> AsyncGenerator[PerformanceMetrics, None]:
    while True:
        metrics = await metrics_collector.get_current_metrics()
        yield PerformanceMetrics(**metrics)
        await asyncio.sleep(interval_seconds)
```

### Subscription Management

#### Publisher Service
```python
class SubscriptionManager:
    async def publish_recommendation_update(
        self, tenant_id: UUID, user_id: UUID, 
        algorithm: str, recommendations: List[Dict]
    ):
        channel = f"recommendations:{tenant_id}:{user_id}:{algorithm}"
        message = {
            'type': 'recommendation_update',
            'items': recommendations,
            'timestamp': datetime.utcnow().isoformat()
        }
        await redis_client.publish(channel, json.dumps(message))
    
    async def publish_interaction(self, interaction: Dict):
        tenant_id = interaction['tenant_id']
        item_id = interaction['item_id']
        user_id = interaction['user_id']
        
        # Multiple channel publishing
        channels = [
            f"interactions:{tenant_id}:{item_id}",
            f"activity:{tenant_id}:{user_id}"
        ]
        
        for channel in channels:
            await redis_client.publish(channel, json.dumps(interaction))
```

### Connection Management

#### WebSocket Lifecycle
```python
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connection_id = str(uuid.uuid4())
    
    try:
        # Register connection
        await metrics_collector.record_websocket_connection(tenant_id, connected=True)
        
        # Handle messages
        async for message in websocket.iter_text():
            await process_graphql_subscription(message, websocket, connection_id)
            
    except WebSocketDisconnect:
        # Cleanup on disconnect
        await metrics_collector.record_websocket_connection(tenant_id, connected=False)
        await cleanup_connection(connection_id)
```

### Subscription Filtering and Authorization

#### Tenant-Aware Subscriptions
```python
@strawberry.subscription
@require_auth
async def tenant_item_updates(self, info) -> AsyncGenerator[Item, None]:
    # Only receive updates for items in user's tenant
    tenant_id = info.context.tenant_id
    channel = f"items:{tenant_id}:updates"
    
    async for update in self._listen_to_channel(channel):
        item = await self._validate_item_access(update['item_id'], tenant_id)
        if item:
            yield item
```

## Authentication and Rate Limiting

### JWT Authentication System

#### Token Management
```python
class JWTHandler:
    def create_access_token(
        self, user_id: UUID, tenant_id: UUID, email: str, 
        subscription_tier: str = "basic", expires_delta: Optional[timedelta] = None
    ) -> str:
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        
        to_encode = {
            "sub": str(user_id),
            "tenant_id": str(tenant_id),
            "email": email,
            "subscription_tier": subscription_tier,
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        }
        
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
```

#### Context Authentication
```python
async def get_context(request: Request, response: Response) -> Context:
    context = Context()
    
    # Extract token from Authorization header
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user_info = jwt_handler.get_user_from_token(token)
        
        if user_info:
            context.user_id = user_info["user_id"]
            context.tenant_id = user_info["tenant_id"]
            context.subscription_tier = user_info["subscription_tier"]
            context.is_authenticated = True
    
    return context
```

### Advanced Rate Limiting System

#### Multi-Level Rate Limiting
```python
class AdvancedRateLimiter:
    async def check_rate_limit(
        self, request: Request, user_id: UUID = None, 
        tenant_id: UUID = None, subscription_tier: str = "basic"
    ) -> Optional[Dict[str, Any]]:
        # 1. Tenant-level rate limiting
        if tenant_id:
            tenant_limited = await self._check_tenant_limit(tenant_id, subscription_tier)
            if tenant_limited:
                return tenant_limited
        
        # 2. User-level rate limiting
        if user_id:
            user_limited = await self._check_user_limit(user_id, subscription_tier)
            if user_limited:
                return user_limited
        
        # 3. IP-level rate limiting for unauthenticated requests
        else:
            ip_limited = await self._check_ip_limit(request)
            if ip_limited:
                return ip_limited
        
        return None
```

#### Sliding Window Implementation
```python
async def _is_rate_limited(
    self, key: str, limit: int, window_seconds: int
) -> tuple[bool, Dict[str, Any]]:
    current_time = int(time.time())
    window_start = current_time - window_seconds
    
    # Redis sorted set for sliding window
    pipe = await self.redis._cluster.pipeline()
    
    # Remove old entries
    pipe.zremrangebyscore(key, 0, window_start)
    # Count current requests
    pipe.zcard(key)
    # Add current request
    pipe.zadd(key, {str(current_time): current_time})
    # Set expiration
    pipe.expire(key, window_seconds)
    
    results = await pipe.execute()
    current_count = results[1] + 1
    
    is_limited = current_count > limit
    
    return is_limited, {
        "current_count": current_count,
        "limit": limit,
        "window_seconds": window_seconds,
        "reset_time": current_time + window_seconds
    }
```

#### GraphQL Operation Rate Limiting
```python
class GraphQLRateLimiter:
    def __init__(self):
        self.operation_limits = {
            "query": "2000/hour",
            "mutation": "1000/hour", 
            "subscription": "500/hour"
        }
        self.expensive_operations = {
            "recommend": 5,      # Costs 5 operations
            "similarItems": 3,   # Costs 3 operations
            "trainModel": 10     # Costs 10 operations
        }
    
    async def check_graphql_rate_limit(
        self, request: Request, operation_type: str, operation_name: str = None,
        user_id: UUID = None, tenant_id: UUID = None, subscription_tier: str = "basic"
    ):
        # Calculate operation cost
        cost = self.expensive_operations.get(operation_name, 1)
        
        # Apply subscription tier modifiers
        if subscription_tier == "basic":
            cost *= 2
        elif subscription_tier == "premium":
            cost *= 1.5
        
        # Check operation-specific limits
        return await self._check_operation_limit(
            operation_type, cost, user_id, tenant_id, subscription_tier
        )
```

### Authorization Decorators

#### Require Authentication
```python
def require_auth(func):
    @wraps(func)
    async def wrapper(self, info, *args, **kwargs):
        if not info.context.is_authenticated:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
        return await func(self, info, *args, **kwargs)
    return wrapper
```

#### Require Tenant Access
```python
def require_tenant(func):
    @wraps(func)
    async def wrapper(self, info, *args, **kwargs):
        if not info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant access required"
            )
        return await func(self, info, *args, **kwargs)
    return wrapper
```

## Performance Metrics and Monitoring

### Metrics Collection Architecture

#### Prometheus Integration
```python
class MetricsCollector:
    def __init__(self):
        # Request metrics
        self.request_count = Counter(
            'graphql_requests_total',
            'Total GraphQL requests',
            ['operation_type', 'operation_name', 'tenant_id', 'status']
        )
        
        self.request_duration = Histogram(
            'graphql_request_duration_seconds',
            'GraphQL request duration',
            ['operation_type', 'operation_name', 'tenant_id']
        )
        
        # Recommendation metrics
        self.recommendation_requests = Counter(
            'recommendation_requests_total',
            'Total recommendation requests', 
            ['algorithm', 'tenant_id', 'status']
        )
        
        self.recommendation_duration = Histogram(
            'recommendation_duration_seconds',
            'Recommendation generation duration',
            ['algorithm', 'tenant_id']
        )
```

#### Performance Tracking Context Manager
```python
class PerformanceTracker:
    def __init__(self, metrics_collector: MetricsCollector, operation_type: str,
                 operation_name: str = None, tenant_id: str = None):
        self.metrics_collector = metrics_collector
        self.operation_type = operation_type
        self.operation_name = operation_name
        self.tenant_id = tenant_id
        self.status = "success"
    
    async def __aenter__(self):
        self.start_time = time.time()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        
        if exc_type:
            self.status = "error"
            await self.metrics_collector.record_error(
                error_type=str(exc_type.__name__), tenant_id=self.tenant_id
            )
        
        await self.metrics_collector.record_request(
            operation_type=self.operation_type,
            operation_name=self.operation_name,
            tenant_id=self.tenant_id,
            duration=duration,
            status=self.status
        )
```

### Health Monitoring

#### System Health Checks
```python
async def get_health_status(self) -> Dict[str, Any]:
    current_metrics = await self.get_current_metrics()
    
    health_status = "healthy"
    issues = []
    
    # Response time threshold
    if current_metrics["average_response_time"] > 1.0:
        health_status = "degraded"
        issues.append("High response time")
    
    # Error rate threshold  
    if current_metrics["error_rate"] > 0.05:
        health_status = "unhealthy"
        issues.append("High error rate")
    
    # Cache hit rate threshold
    if current_metrics["cache_hit_rate"] < 0.8:
        if health_status == "healthy":
            health_status = "degraded"
        issues.append("Low cache hit rate")
    
    return {
        "status": health_status,
        "issues": issues,
        "metrics": current_metrics,
        "timestamp": datetime.utcnow().isoformat()
    }
```

### Alert Management

#### Alert System
```python
class AlertManager:
    def __init__(self, metrics_collector: MetricsCollector):
        self.alert_thresholds = {
            "high_response_time": 2.0,      # seconds
            "high_error_rate": 0.1,         # 10%
            "low_cache_hit_rate": 0.7,      # 70%
            "high_recommendation_latency": 5000.0  # 5 seconds
        }
        self.alert_cooldowns = defaultdict(int)
        self.cooldown_period = 300  # 5 minutes
    
    async def check_alerts(self):
        current_time = int(time.time())
        health_status = await self.metrics_collector.get_health_status()
        
        # Check each alert condition
        for alert_type, threshold in self.alert_thresholds.items():
            if self._should_trigger_alert(health_status, alert_type, threshold, current_time):
                await self._send_alert(alert_type, health_status)
                self.alert_cooldowns[alert_type] = current_time + self.cooldown_period
```

### Distributed Tracing

#### OpenTelemetry Integration
```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Configure tracing
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

jaeger_exporter = JaegerExporter(
    agent_host_name="jaeger",
    agent_port=6831,
)

span_processor = BatchSpanProcessor(jaeger_exporter)
trace.get_tracer_provider().add_span_processor(span_processor)

# Usage in resolvers
@strawberry.field
async def recommendations(self, info, options: RecommendationOptions = None):
    with tracer.start_as_current_span("generate_recommendations") as span:
        span.set_attribute("user_id", str(info.context.user_id))
        span.set_attribute("algorithm", options.algorithm if options else "hybrid")
        
        # Recommendation logic
        recommendations = await self._generate_recommendations(info, options)
        
        span.set_attribute("recommendations_count", len(recommendations))
        return recommendations
```

## Testing Strategies

### Test Architecture

The testing strategy covers multiple levels with comprehensive coverage:

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── test_auth.py        # Authentication logic tests
│   ├── test_cache.py       # Cache operations tests
│   └── test_recommendation_engines.py
├── integration/            # Integration tests
│   └── test_graphql_api.py # GraphQL endpoint tests
├── e2e/                   # End-to-end tests
│   └── test_recommendation_flow.py
├── fixtures/              # Test data fixtures
└── conftest.py           # Pytest configuration
```

### Unit Testing

#### Recommendation Engine Tests
```python
# tests/unit/test_recommendation_engines.py
import pytest
from app.recommendation.collaborative_filtering import UserBasedCollaborativeFiltering
from app.recommendation.content_based import ContentBasedRecommendationEngine

class TestCollaborativeFiltering:
    @pytest.fixture
    async def engine(self):
        return UserBasedCollaborativeFiltering(k_neighbors=10, min_interactions=2)
    
    @pytest.fixture
    def sample_interactions(self):
        return [
            {"user_id": "user1", "item_id": "item1", "rating": 5.0},
            {"user_id": "user1", "item_id": "item2", "rating": 3.0},
            {"user_id": "user2", "item_id": "item1", "rating": 4.0},
            {"user_id": "user2", "item_id": "item3", "rating": 5.0},
        ]
    
    async def test_training(self, engine, sample_interactions):
        await engine.train(sample_interactions)
        
        assert engine.is_trained
        assert engine.user_item_matrix is not None
        assert engine.user_similarity_matrix is not None
    
    async def test_recommendations(self, engine, sample_interactions):
        await engine.train(sample_interactions)
        
        context = RecommendationContext(
            user_id="user1",
            tenant_id="tenant1", 
            num_recommendations=5
        )
        
        recommendations = await engine.recommend(context)
        
        assert len(recommendations) <= 5
        assert all(isinstance(rec, RecommendationItem) for rec in recommendations)
        assert all(rec.score > 0 for rec in recommendations)
```

#### Cache Testing
```python
# tests/unit/test_cache.py
import pytest
from app.cache.cache_manager import CacheManager

class TestCacheManager:
    @pytest.fixture
    async def cache_manager(self):
        return CacheManager()
    
    async def test_recommendation_caching(self, cache_manager):
        user_id = uuid.uuid4()
        algorithm = "collaborative"
        recommendations = [{"item_id": "item1", "score": 0.9}]
        
        # Test set
        result = await cache_manager.set_recommendations(
            user_id, algorithm, recommendations
        )
        assert result is True
        
        # Test get
        cached = await cache_manager.get_recommendations(user_id, algorithm)
        assert cached == recommendations
    
    async def test_cache_invalidation(self, cache_manager):
        user_id = uuid.uuid4()
        
        # Set user data
        await cache_manager.set_user_data(user_id, {"email": "test@example.com"})
        
        # Invalidate
        await cache_manager.invalidate_user_cache(user_id)
        
        # Verify removal
        cached_user = await cache_manager.get_user_data(user_id)
        assert cached_user is None
```

### Integration Testing

#### GraphQL API Tests
```python
# tests/integration/test_graphql_api.py
import pytest
from httpx import AsyncClient
from app.main import app

class TestGraphQLAPI:
    @pytest.fixture
    async def client(self):
        async with AsyncClient(app=app, base_url="http://test") as ac:
            yield ac
    
    async def test_recommendations_query(self, client, auth_headers):
        query = """
        query GetRecommendations($options: RecommendationOptions) {
            recommendations(options: $options) {
                items {
                    item {
                        id
                        title
                    }
                    score
                    reason
                }
                algorithm
                responseTimeMs
            }
        }
        """
        
        variables = {
            "options": {
                "algorithm": "hybrid",
                "numRecommendations": 10
            }
        }
        
        response = await client.post(
            "/graphql",
            json={"query": query, "variables": variables},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "recommendations" in data["data"]
        
        recommendations = data["data"]["recommendations"]
        assert len(recommendations["items"]) <= 10
        assert recommendations["algorithm"] == "hybrid"
        assert recommendations["responseTimeMs"] > 0
    
    async def test_rate_limiting(self, client):
        # Test rate limiting by making multiple requests
        query = "query { performanceMetrics { queryCount } }"
        
        responses = []
        for _ in range(100):  # Exceed rate limit
            response = await client.post(
                "/graphql",
                json={"query": query}
            )
            responses.append(response)
        
        # Should eventually get rate limited
        rate_limited = any(r.status_code == 429 for r in responses)
        assert rate_limited
```

### End-to-End Testing

#### Complete Recommendation Flow
```python
# tests/e2e/test_recommendation_flow.py
import pytest
from httpx import AsyncClient

class TestRecommendationFlow:
    async def test_complete_recommendation_workflow(self, client, test_tenant):
        # 1. Register user
        register_mutation = """
        mutation Register($input: RegisterInput!) {
            register(input: $input) {
                accessToken
                user {
                    id
                    email
                }
            }
        }
        """
        
        register_response = await client.post("/graphql", json={
            "query": register_mutation,
            "variables": {
                "input": {
                    "email": "test@example.com",
                    "username": "testuser",
                    "password": "password123",
                    "tenantDomain": test_tenant.domain
                }
            }
        })
        
        assert register_response.status_code == 200
        auth_data = register_response.json()["data"]["register"]
        headers = {"Authorization": f"Bearer {auth_data['accessToken']}"}
        
        # 2. Create items
        create_item_mutation = """
        mutation CreateItem($input: ItemInput!) {
            createItem(input: $input) {
                id
                title
                category
            }
        }
        """
        
        items = []
        for i in range(5):
            item_response = await client.post("/graphql", json={
                "query": create_item_mutation,
                "variables": {
                    "input": {
                        "title": f"Test Item {i}",
                        "description": f"Description for item {i}",
                        "category": "electronics"
                    }
                }
            }, headers=headers)
            
            items.append(item_response.json()["data"]["createItem"])
        
        # 3. Record interactions
        interaction_mutation = """
        mutation RecordInteraction($input: InteractionInput!) {
            recordInteraction(input: $input) {
                id
                interactionType
            }
        }
        """
        
        for item in items[:3]:  # Interact with first 3 items
            await client.post("/graphql", json={
                "query": interaction_mutation,
                "variables": {
                    "input": {
                        "itemId": item["id"],
                        "interactionType": "view",
                        "interactionValue": 1.0
                    }
                }
            }, headers=headers)
        
        # 4. Get recommendations
        recommendations_query = """
        query GetRecommendations {
            recommendations {
                items {
                    item {
                        id
                        title
                    }
                    score
                }
                algorithm
                responseTimeMs
            }
        }
        """
        
        rec_response = await client.post("/graphql", json={
            "query": recommendations_query
        }, headers=headers)
        
        assert rec_response.status_code == 200
        recommendations = rec_response.json()["data"]["recommendations"]
        
        # Verify recommendations
        assert len(recommendations["items"]) > 0
        assert recommendations["responseTimeMs"] > 0
        assert all(item["score"] > 0 for item in recommendations["items"])
```

### Test Configuration

#### Pytest Configuration
```python
# conftest.py
import pytest
import asyncio
from httpx import AsyncClient
from app.main import app
from app.database import init_test_database
from app.models import Tenant, User

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(autouse=True)
async def setup_test_db():
    """Setup test database before each test."""
    await init_test_database()
    yield
    await cleanup_test_database()

@pytest.fixture
async def test_tenant():
    """Create test tenant."""
    tenant = Tenant(
        name="Test Tenant",
        domain="test.example.com",
        subscription_tier="premium"
    )
    # Save to database
    return tenant

@pytest.fixture
async def auth_headers(test_tenant):
    """Create authentication headers."""
    # Create test user and generate token
    token = create_test_token(test_tenant.id)
    return {"Authorization": f"Bearer {token}"}
```

## Deployment Architecture

### Container Orchestration

#### Docker Multi-Stage Build
```dockerfile
# Multi-stage build for optimization
FROM python:3.11-slim as builder
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim as production
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app
RUN apt-get update && apt-get install -y libpq5 curl && rm -rf /var/lib/apt/lists/*
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Kubernetes Deployment

#### API Deployment
```yaml
# k8s/api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: graphql-recommendation-api
  namespace: recommendation-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: graphql-recommendation-api
  template:
    metadata:
      labels:
        app: graphql-recommendation-api
    spec:
      containers:
      - name: api
        image: graphql-recommendation-api:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: database-url
        - name: REDIS_NODES
          value: "redis://redis-cluster:6379"
        - name: VECTOR_DB_PROVIDER
          value: "qdrant"
        - name: QDRANT_URL
          value: "http://qdrant:6333"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Horizontal Pod Autoscaler
```yaml
# k8s/api/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: graphql-recommendation-api-hpa
  namespace: recommendation-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: graphql-recommendation-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Infrastructure Components

#### Redis Cluster Deployment
```yaml
# k8s/cache/redis-cluster.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis-cluster
spec:
  serviceName: redis-cluster
  replicas: 6
  selector:
    matchLabels:
      app: redis-cluster
  template:
    metadata:
      labels:
        app: redis-cluster
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        - containerPort: 16379
        command:
        - redis-server
        - /conf/redis.conf
        - --cluster-enabled
        - "yes"
        - --cluster-config-file
        - nodes.conf
        - --cluster-node-timeout
        - "5000"
        volumeMounts:
        - name: redis-data
          mountPath: /data
        - name: redis-conf
          mountPath: /conf
  volumeClaimTemplates:
  - metadata:
      name: redis-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

#### Vector Database Deployment
```yaml
# k8s/cache/qdrant.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qdrant
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qdrant
  template:
    metadata:
      labels:
        app: qdrant
    spec:
      containers:
      - name: qdrant
        image: qdrant/qdrant:latest
        ports:
        - containerPort: 6333
        - containerPort: 6334
        env:
        - name: QDRANT__SERVICE__HTTP_PORT
          value: "6333"
        - name: QDRANT__SERVICE__GRPC_PORT
          value: "6334"
        volumeMounts:
        - name: qdrant-storage
          mountPath: /qdrant/storage
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
      volumes:
      - name: qdrant-storage
        persistentVolumeClaim:
          claimName: qdrant-pvc
```

### Monitoring and Observability

#### Prometheus Configuration
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

scrape_configs:
  - job_name: 'graphql-recommendation-api'
    static_configs:
      - targets: ['api:8000']
    metrics_path: '/metrics'
    scrape_interval: 30s
    
  - job_name: 'redis-cluster'
    static_configs:
      - targets: ['redis-cluster:6379']
    
  - job_name: 'qdrant'
    static_configs:
      - targets: ['qdrant:6333']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

#### Grafana Dashboard Configuration
```json
{
  "dashboard": {
    "title": "GraphQL Recommendation API",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(graphql_requests_total[5m])",
            "legendFormat": "{{operation_type}} - {{status}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph", 
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(graphql_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Recommendation Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(recommendation_duration_seconds_bucket[5m]))",
            "legendFormat": "{{algorithm}} - 95th percentile"
          }
        ]
      }
    ]
  }
}
```

### Load Balancing and Ingress

#### Nginx Load Balancer
```nginx
# nginx/nginx.conf
upstream api_backend {
    least_conn;
    server api-1:8000;
    server api-2:8000;
    server api-3:8000;
}

server {
    listen 80;
    server_name api.recommendation.com;
    
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    location /health {
        access_log off;
        proxy_pass http://api_backend;
    }
}
```

#### Kubernetes Ingress
```yaml
# k8s/ingress/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: recommendation-api-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  tls:
  - hosts:
    - api.recommendation.com
    secretName: recommendation-api-tls
  rules:
  - host: api.recommendation.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: graphql-recommendation-api
            port:
              number: 8000
```

### Security and Secrets Management

#### Secret Management
```yaml
# k8s/api/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
  namespace: recommendation-system
type: Opaque
data:
  database-url: <base64-encoded-database-url>
  secret-key: <base64-encoded-jwt-secret>
  redis-password: <base64-encoded-redis-password>
  vector-db-api-key: <base64-encoded-vector-db-key>
```

This comprehensive technical documentation covers all major aspects of the GraphQL Recommendation API system, from architecture and implementation details to deployment and monitoring strategies. The system demonstrates enterprise-grade patterns and practices for building scalable, high-performance recommendation systems.