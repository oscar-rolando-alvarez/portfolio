# API GraphQL de Recomendaciones - Documentación Técnica

## Tabla de Contenidos

1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Arquitectura de la API GraphQL](#arquitectura-de-la-api-graphql)
3. [Patrones de Diseño de Microservicios](#patrones-de-diseño-de-microservicios)
4. [Implementación de Algoritmos de Recomendación](#implementación-de-algoritmos-de-recomendación)
5. [Arquitectura de Base de Datos Vectorial](#arquitectura-de-base-de-datos-vectorial)
6. [Caché Distribuido con Redis Cluster](#caché-distribuido-con-redis-cluster)
7. [Diseño de Sistema Multi-Tenant](#diseño-de-sistema-multi-tenant)
8. [Implementación del Patrón DataLoader](#implementación-del-patrón-dataloader)
9. [Subscripciones en Tiempo Real](#subscripciones-en-tiempo-real)
10. [Autenticación y Limitación de Velocidad](#autenticación-y-limitación-de-velocidad)
11. [Métricas de Rendimiento y Monitoreo](#métricas-de-rendimiento-y-monitoreo)
12. [Estrategias de Pruebas](#estrategias-de-pruebas)
13. [Arquitectura de Despliegue](#arquitectura-de-despliegue)

## Visión General de la Arquitectura

La API GraphQL de Recomendaciones es un sistema de recomendación sofisticado y de alto rendimiento construido con tecnologías modernas de Python y diseñado para despliegues a escala empresarial. El sistema combina múltiples algoritmos de recomendación, capacidades de procesamiento en tiempo real y estrategias avanzadas de caché para entregar recomendaciones personalizadas a través de una interfaz GraphQL unificada.

### Stack de Tecnologías Principales

- **Framework**: FastAPI con Strawberry GraphQL
- **Runtime**: Python 3.11 con AsyncIO
- **Base de Datos**: PostgreSQL con SQLAlchemy (async)
- **Caché**: Redis Cluster
- **Base de Datos Vectorial**: Qdrant/Pinecone/Weaviate (configurable)
- **Monitoreo**: Prometheus + Grafana + Jaeger
- **Orquestación de Contenedores**: Docker + Kubernetes

### Características del Sistema

- **Arquitectura multi-tenant** con aislamiento a nivel de tenant
- **Escalabilidad horizontal** mediante patrones de microservicios
- **Capacidades en tiempo real** vía subscripciones WebSocket
- **Estrategias avanzadas de caché** para tiempos de respuesta sub-segundo
- **Múltiples algoritmos de recomendación** con enfoques híbridos
- **Monitoreo integral** y observabilidad

## Arquitectura de la API GraphQL

### Diseño del Esquema Principal

El esquema GraphQL está diseñado alrededor de cinco tipos de entidad principales:

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

### Operaciones de Consulta

#### Consultas Principales
- `me`: Usuario autenticado actual
- `user(id: UUID)`: Usuario específico por ID
- `users(limit: Int, offset: Int)`: Lista paginada de usuarios
- `item(id: UUID)`: Artículo específico por ID
- `items(category: String, search: String)`: Artículos filtrados

#### Consultas de Recomendación
- `recommendations(options: RecommendationOptions)`: Endpoint principal de recomendaciones
- `similarItems(itemId: UUID, topK: Int)`: Similitud artículo-a-artículo
- `rateLimitStatus`: Estado actual de limitación de velocidad
- `performanceMetrics`: Datos de rendimiento del sistema

### Operaciones de Mutación

#### Autenticación
- `login(input: LoginInput)`: Autenticación de usuario
- `register(input: RegisterInput)`: Registro de usuario

#### Interacciones de Usuario
- `recordInteraction(input: InteractionInput)`: Seguimiento de comportamiento de usuario
- `rateItem(input: RatingInput)`: Envío de calificaciones de artículos
- `createItem(input: ItemInput)`: Creación de nuevos artículos

### Operaciones de Subscripción

#### Actualizaciones en Tiempo Real
- `recommendationUpdates(algorithm: String)`: Cambios de recomendaciones en vivo
- `itemInteractions(itemId: UUID)`: Seguimiento de interacciones en tiempo real
- `userActivity`: Feed de actividad específico del usuario
- `performanceMetricsStream`: Métricas del sistema en vivo
- `trendingItems(category: String)`: Datos de tendencias en tiempo real

### Características Avanzadas de GraphQL

#### Escalares Personalizados
```python
@strawberry.scalar
class UUID:
    def serialize(value: uuid.UUID) -> str:
        return str(value)
    
    def parse_value(value: str) -> uuid.UUID:
        return uuid.UUID(value)
```

#### Validación de Entrada
```python
@strawberry.input
class RecommendationOptions:
    algorithm: Optional[str] = "hybrid"
    num_recommendations: Optional[int] = 10
    diversify: Optional[bool] = True
    explain: Optional[bool] = False
    filters: Optional[RecommendationFilter] = None
```

## Patrones de Diseño de Microservicios

### Descomposición de Servicios

El sistema sigue una arquitectura de microservicios modular con clara separación de responsabilidades:

#### Servicios Principales
1. **Servicio de API Gateway** (`app.main`)
   - Aplicación FastAPI con endpoint GraphQL
   - Enrutamiento de solicitudes y balanceador de carga
   - Middleware de CORS y seguridad

2. **Servicio de Autenticación** (`app.auth`)
   - Gestión de tokens JWT
   - Autenticación y autorización de usuarios
   - Control de acceso basado en tenant

3. **Servicio de Recomendación** (`app.recommendation`)
   - Implementaciones de múltiples algoritmos
   - Entrenamiento e inferencia de modelos
   - Lógica de recomendación híbrida

4. **Servicio de Caché** (`app.cache`)
   - Gestión de Redis Cluster
   - Estrategias de caché multi-nivel
   - Patrones de invalidación de caché

5. **Servicio Vectorial** (`app.utils.vector_db`)
   - Abstracción de base de datos vectorial
   - Operaciones de búsqueda de similitud
   - Soporte para múltiples proveedores

6. **Servicio de Monitoreo** (`app.monitoring`)
   - Recolección y agregación de métricas
   - Seguimiento de rendimiento
   - Gestión de alertas

### Implementación de Patrones de Diseño

#### Patrón Repository
```python
class UserRepository:
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        async for session in get_async_session():
            stmt = select(User).where(User.id == user_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
```

#### Patrón Factory
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

#### Patrón Strategy
```python
class WeightedHybridRecommendationEngine:
    async def _calculate_adaptive_weights(self, user_id: UUID) -> Dict[str, float]:
        # Cálculo dinámico de pesos basado en disponibilidad de datos
        has_cf_data = user_id in self.user_cf.user_mapping
        has_content_data = user_id in self.content_based.user_profiles
        
        # Redistribución adaptativa de pesos
        weights = self._redistribute_weights(has_cf_data, has_content_data)
        return weights
```

#### Patrón Observer
```python
class SubscriptionManager:
    async def publish_recommendation_update(
        self, tenant_id: UUID, user_id: UUID, 
        algorithm: str, recommendations: List[Dict]
    ):
        channel = f"recommendations:{tenant_id}:{user_id}:{algorithm}"
        await redis_client.publish(channel, json.dumps(recommendations))
```

## Implementación de Algoritmos de Recomendación

### Arquitectura de Algoritmos

El sistema de recomendación implementa múltiples algoritmos con una interfaz unificada:

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

### 1. Filtrado Colaborativo

#### Filtrado Colaborativo Basado en Usuario
```python
class UserBasedCollaborativeFiltering(BaseRecommendationEngine):
    def __init__(self, k_neighbors: int = 50, min_interactions: int = 5):
        self.k_neighbors = k_neighbors
        self.min_interactions = min_interactions
        self.user_similarity_matrix = None
        self.user_item_matrix = None
```

**Detalles de Implementación:**
- **Cálculo de Similitud**: Similitud coseno entre vectores de usuario
- **Selección de Vecindario**: Usuarios K más similares
- **Predicción**: Promedio ponderado de calificaciones de vecinos
- **Manejo de Arranque en Frío**: Fallback a artículos populares

#### Filtrado Colaborativo Basado en Artículos
```python
class ItemBasedCollaborativeFiltering(BaseRecommendationEngine):
    async def train(self, interactions: List[Dict], **kwargs):
        # Construir matriz usuario-artículo
        user_item_matrix = self._build_matrix(interactions)
        # Calcular similitud artículo-artículo (transponer para similitud de artículos)
        self.item_similarity_matrix = cosine_similarity(user_item_matrix.T)
```

**Características Clave:**
- **Estabilidad**: Más estable que FC basado en usuario
- **Escalabilidad**: Mejor rendimiento con bases de usuario grandes
- **Explicabilidad**: Razonamiento de similitud claro

### 2. Filtrado Basado en Contenido

```python
class ContentBasedRecommendationEngine(BaseRecommendationEngine):
    def __init__(self, text_weight: float = 0.6, categorical_weight: float = 0.3, numerical_weight: float = 0.1):
        self.tfidf_vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
        self.label_encoders = {}
        self.scaler = StandardScaler()
```

**Ingeniería de Características:**
1. **Características de Texto**: Vectorización TF-IDF de título, descripción, etiquetas
2. **Características Categóricas**: Codificación one-hot de categorías
3. **Características Numéricas**: Metadatos numéricos estandarizados
4. **Combinación de Características**: Concatenación ponderada

**Construcción de Perfil de Usuario:**
```python
async def _build_user_profiles(self, interactions_df):
    for user_id in interactions_df['user_id'].unique():
        user_interactions = interactions_df[interactions_df['user_id'] == user_id]
        # Promedio ponderado de características de artículos interactuados
        item_features = self.combined_features_matrix[interacted_items]
        user_profile = np.average(item_features, axis=0, weights=weights)
        self.user_profiles[user_id] = user_profile
```

### 3. Factorización de Matrices

#### Implementación SVD
```python
class SVDRecommendationEngine(BaseRecommendationEngine):
    def __init__(self, n_factors: int = 100, n_epochs: int = 20):
        self.model = SVD(n_factors=n_factors, n_epochs=n_epochs, 
                        lr_all=0.005, reg_all=0.02, random_state=42)
```

#### Modelo de Retroalimentación Implícita
```python
class ImplicitMFRecommendationEngine(BaseRecommendationEngine):
    async def train(self, interactions: List[Dict], **kwargs):
        # Convertir a formato de matriz dispersa
        self.user_item_matrix = csr_matrix((data, (row, col)), shape=(n_users, n_items))
        # Entrenar modelo ALS
        self.model = implicit.als.AlternatingLeastSquares(
            factors=self.factors, iterations=self.iterations,
            regularization=self.regularization, random_state=42
        )
        self.model.fit(self.user_item_matrix)
```

### 4. Enfoques Híbridos

#### Motor Híbrido Ponderado
```python
class WeightedHybridRecommendationEngine(BaseRecommendationEngine):
    async def recommend(self, context: RecommendationContext) -> List[RecommendationItem]:
        weights = await self._calculate_adaptive_weights(context.user_id)
        all_recommendations = {}
        
        # Combinar recomendaciones de múltiples motores
        for engine, weight in zip(self.engines, weights.values()):
            if weight > 0:
                engine_recs = await engine.recommend(context)
                self._merge_recommendations(all_recommendations, engine_recs, weight)
```

**Cálculo de Peso Adaptativo:**
- Evaluación de disponibilidad de datos
- Ajustes basados en rendimiento
- Análisis del historial de interacción del usuario

#### Motor Híbrido de Conmutación
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

### Optimización del Rendimiento de Algoritmos

#### Estrategias de Caché
```python
@cache_result("similarity_matrix", ttl=86400)  # 24 horas
async def compute_similarity_matrix(self, algorithm: str):
    # Computación costosa cacheada para reutilización
    return similarity_matrix
```

#### Procesamiento Paralelo
```python
async def batch_recommendations(self, user_contexts: List[RecommendationContext]):
    tasks = [self.recommend(context) for context in user_contexts]
    return await asyncio.gather(*tasks)
```

## Arquitectura de Base de Datos Vectorial

### Abstracción Multi-Proveedor

El sistema soporta múltiples proveedores de bases de datos vectoriales a través de una interfaz unificada:

```python
class BaseVectorDB(ABC):
    @abstractmethod
    async def search_similar(self, collection: str, query_vector: List[float], 
                           top_k: int, filter_conditions: Dict) -> List[Dict]:
        pass
```

### Proveedores Soportados

#### 1. Integración con Qdrant
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

#### 2. Integración con Pinecone
```python
class PineconeVectorDB(BaseVectorDB):
    async def search_similar(self, collection: str, query_vector: List[float], 
                           top_k: int, filter_conditions: Dict) -> List[Dict]:
        results = self.index.query(vector=query_vector, top_k=top_k, 
                                 include_metadata=True, filter=filter_conditions)
        return [{'id': m['id'], 'score': m['score'], 'metadata': m.get('metadata', {})} 
                for m in results['matches']]
```

#### 3. Integración con Weaviate
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

### Operaciones Vectoriales

#### Almacenamiento de Vectores de Artículos
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

#### Búsqueda de Similitud
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

### Pipeline de Generación de Vectores

#### Extracción de Características de Contenido
```python
async def generate_item_vectors(self, items: List[Dict]) -> List[Dict]:
    for item in items:
        # Combinar características de texto
        text_content = f"{item.get('title', '')} {item.get('description', '')} {' '.join(item.get('tags', []))}"
        # Generar embeddings usando TF-IDF o modelos transformer
        vector = await self._text_to_vector(text_content)
        item['vector'] = vector.tolist()
    return items
```

## Caché Distribuido con Redis Cluster

### Arquitectura de Redis Cluster

El sistema utiliza un Redis Cluster de 3 nodos para alta disponibilidad y escalamiento horizontal:

```yaml
# Configuración Docker Compose
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

### Implementación del Cliente Redis

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

### Estrategias de Caché

#### 1. Caché Multi-Nivel
```python
class CacheManager:
    def __init__(self):
        self.recommendation_ttl = 1800  # 30 minutos
        self.user_data_ttl = 7200      # 2 horas
        self.item_data_ttl = 14400     # 4 horas
        self.similarity_matrix_ttl = 86400  # 24 horas
```

#### 2. Generación de Claves de Caché
```python
def _generate_cache_key(self, prefix: str, *args, **kwargs) -> str:
    key_parts = [str(prefix)]
    key_parts.extend([str(arg) for arg in args])
    key_parts.extend([f"{k}:{v}" for k, v in sorted(kwargs.items())])
    key_string = "|".join(key_parts)
    
    # Hash claves largas para prevenir problemas de longitud de clave en Redis
    if len(key_string) > 200:
        key_hash = hashlib.md5(key_string.encode()).hexdigest()
        return f"{prefix}:hash:{key_hash}"
    
    return key_string.replace(" ", "_")
```

#### 3. Operaciones de Caché

**Caché de Recomendaciones:**
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

**Integración con DataLoader:**
```python
class UserDataLoader(DataLoader):
    async def batch_load_fn(self, user_ids: List[UUID]) -> List[Optional[User]]:
        # Verificar caché primero
        cached_users = {}
        uncached_ids = []
        
        for user_id in user_ids:
            cached_user = await cache_manager.get_user_data(user_id)
            if cached_user:
                cached_users[user_id] = cached_user
            else:
                uncached_ids.append(user_id)
        
        # Obtener usuarios no cacheados de la base de datos
        if uncached_ids:
            users = await self._fetch_from_db(uncached_ids)
            for user in users:
                await cache_manager.set_user_data(user.id, user.to_dict())
```

#### 4. Invalidación de Caché

**Invalidación de Caché de Usuario:**
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

### Optimización del Rendimiento de Caché

#### 1. Operaciones Pipeline
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

#### 2. Compresión para Objetos Grandes
```python
async def set_large_object(self, key: str, value: Any, expire: int = None):
    # Comprimir objetos grandes para reducir uso de memoria
    if len(json.dumps(value)) > 1024:  # Umbral de 1KB
        compressed_value = gzip.compress(json.dumps(value).encode())
        await redis_client.set(f"{key}:compressed", compressed_value, expire)
    else:
        await redis_client.set(key, value, expire)
```

## Diseño de Sistema Multi-Tenant

### Arquitectura de Aislamiento de Tenant

El sistema implementa aislamiento estricto de tenant en múltiples niveles:

#### 1. Aislamiento a Nivel de Base de Datos
```python
class TenantAwareModel(BaseModel):
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    
    @hybrid_property
    def tenant_filter(cls):
        return cls.tenant_id == current_tenant_id()
```

#### 2. Aislamiento de Contexto GraphQL
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

#### 3. Consultas Conscientes de Tenant
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

### Gestión de Configuración de Tenant

#### 1. Configuraciones de Tenant
```python
class Tenant(Base):
    __tablename__ = "tenants"
    
    name = Column(String(100), nullable=False)
    domain = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    subscription_tier = Column(String(50), default="basic")
```

#### 2. Limitación de Velocidad Específica de Tenant
```python
async def check_rate_limit(self, request: Request, user_id: UUID = None, 
                         tenant_id: UUID = None, subscription_tier: str = "basic"):
    # Limitación de velocidad a nivel de tenant
    if tenant_id:
        tenant_limit_str = "50000/hour"  # Límite base de tenant
        if subscription_tier == "enterprise":
            tenant_limit_str = "200000/hour"
        
        tenant_key = f"tenant:{tenant_id}"
        tenant_limited, tenant_info = await self._is_rate_limited(tenant_key, tenant_limit_str)
        
        if tenant_limited:
            return {"error": "Límite de velocidad de tenant excedido", **tenant_info}
```

#### 3. Caché Consciente de Tenant
```python
async def get_recommendations(self, user_id: UUID, algorithm: str, tenant_id: UUID):
    cache_key = f"rec:{tenant_id}:{user_id}:{algorithm}"
    return await redis_client.get(cache_key)
```

### Procesamiento de Datos Multi-Tenant

#### 1. Entrenamiento Limitado por Tenant
```python
async def train_recommendation_engine(self, engine, tenant_id: UUID):
    async for session in get_async_session():
        # Obtener interacciones específicas del tenant
        interactions_stmt = select(InteractionModel).where(
            InteractionModel.tenant_id == tenant_id
        )
        interactions = await session.execute(interactions_stmt)
        
        # Obtener artículos específicos del tenant
        items_stmt = select(ItemModel).where(ItemModel.tenant_id == tenant_id)
        items = await session.execute(items_stmt)
        
        # Entrenar solo con datos del tenant
        await engine.train(interactions.scalars().all(), items.scalars().all())
```

#### 2. Asignación de Recursos de Tenant
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

## Implementación del Patrón DataLoader

### Solución al Problema N+1 Query

El patrón DataLoader previene problemas de consultas N+1 mediante la agrupación de solicitudes de base de datos:

```python
class DataLoader:
    def __init__(self, batch_load_fn, batch_size=100):
        self.batch_load_fn = batch_load_fn
        self.batch_size = batch_size
        self._cache = {}
        self._batch = []
        self._batch_promise = None
```

### Implementaciones de DataLoader Principales

#### 1. DataLoader de Usuario
```python
class UserDataLoader(DataLoader):
    async def batch_load_fn(self, user_ids: List[UUID]) -> List[Optional[User]]:
        # Verificar caché primero
        cached_users = {}
        uncached_ids = []
        
        for user_id in user_ids:
            cached_user = await cache_manager.get_user_data(user_id)
            if cached_user:
                cached_users[user_id] = cached_user
            else:
                uncached_ids.append(user_id)
        
        # Obtener usuarios no cacheados en una sola consulta
        users_dict = {}
        if uncached_ids:
            async for session in get_async_session():
                stmt = select(User).where(User.id.in_(uncached_ids))
                result = await session.execute(stmt)
                users = result.scalars().all()
                
                for user in users:
                    users_dict[user.id] = user
                    await cache_manager.set_user_data(user.id, user.to_dict())
        
        # Retornar usuarios en orden solicitado
        all_users = {**cached_users, **users_dict}
        return [all_users.get(user_id) for user_id in user_ids]
```

#### 2. DataLoaders de Relación
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
            
            # Agrupar por usuario
            interactions_dict = {user_id: [] for user_id in user_ids}
            for interaction in interactions:
                interactions_dict[interaction.user_id].append(interaction)
            
            return [interactions_dict.get(user_id, []) for user_id in user_ids]
```

### Gestor de DataLoader

```python
class DataLoaderManager:
    def __init__(self):
        # Cargadores de entidad principal
        self.user_loader = UserDataLoader()
        self.item_loader = ItemDataLoader()
        self.tenant_loader = TenantDataLoader()
        
        # Cargadores de relación
        self.user_interactions_loader = UserInteractionsDataLoader()
        self.user_ratings_loader = UserRatingsDataLoader()
        self.item_interactions_loader = ItemInteractionsDataLoader()
        
        # Cargadores especializados
        self.popular_items_loader = PopularItemsDataLoader()
        self.user_views_loader = UserInteractionsDataLoader("view")
        self.user_purchases_loader = UserInteractionsDataLoader("purchase")
    
    def clear_all(self):
        """Limpiar todos los cachés de DataLoader entre solicitudes."""
        for loader in [self.user_loader, self.item_loader, self.tenant_loader, 
                      self.user_interactions_loader, self.user_ratings_loader]:
            loader.clear_all()
```

### Uso en Resolvers GraphQL

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

### Beneficios de Rendimiento

1. **Reducción de Consultas**: Reduce consultas N+1 a consultas 1+1
2. **Caché**: Caché automático por solicitud
3. **Agrupación**: Agrupa múltiples solicitudes en consultas únicas de base de datos
4. **Eficiencia de Memoria**: Limpia caché entre solicitudes

## Subscripciones en Tiempo Real

### Arquitectura de Subscripción WebSocket

El sistema implementa actualizaciones en tiempo real usando subscripciones GraphQL sobre WebSocket:

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

### Tipos de Subscripción

#### 1. Actualizaciones de Recomendaciones
```python
@strawberry.subscription
async def recommendation_updates(self, info, algorithm: str) -> AsyncGenerator[List[RecommendationItem], None]:
    # Cambios de recomendaciones en vivo cuando cambia el comportamiento del usuario o catálogo de artículos
    pass
```

#### 2. Interacciones de Artículos
```python
@strawberry.subscription
async def item_interactions(self, info, item_id: UUID) -> AsyncGenerator[Interaction, None]:
    # Seguimiento en tiempo real de interacciones para artículos específicos
    channel = f"interactions:{info.context.tenant_id}:{item_id}"
    # Detalles de implementación...
```

#### 3. Feed de Actividad de Usuario
```python
@strawberry.subscription
async def user_activity(self, info) -> AsyncGenerator[Dict[str, Any], None]:
    # Feed de actividad personal para usuario actual
    channel = f"activity:{info.context.tenant_id}:{info.context.user_id}"
    # Detalles de implementación...
```

#### 4. Stream de Métricas de Rendimiento
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

### Gestión de Subscripciones

#### Servicio Publicador
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
        
        # Publicación en múltiples canales
        channels = [
            f"interactions:{tenant_id}:{item_id}",
            f"activity:{tenant_id}:{user_id}"
        ]
        
        for channel in channels:
            await redis_client.publish(channel, json.dumps(interaction))
```

### Gestión de Conexiones

#### Ciclo de Vida WebSocket
```python
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connection_id = str(uuid.uuid4())
    
    try:
        # Registrar conexión
        await metrics_collector.record_websocket_connection(tenant_id, connected=True)
        
        # Manejar mensajes
        async for message in websocket.iter_text():
            await process_graphql_subscription(message, websocket, connection_id)
            
    except WebSocketDisconnect:
        # Limpieza al desconectar
        await metrics_collector.record_websocket_connection(tenant_id, connected=False)
        await cleanup_connection(connection_id)
```

### Filtrado y Autorización de Subscripciones

#### Subscripciones Conscientes de Tenant
```python
@strawberry.subscription
@require_auth
async def tenant_item_updates(self, info) -> AsyncGenerator[Item, None]:
    # Solo recibir actualizaciones para artículos en el tenant del usuario
    tenant_id = info.context.tenant_id
    channel = f"items:{tenant_id}:updates"
    
    async for update in self._listen_to_channel(channel):
        item = await self._validate_item_access(update['item_id'], tenant_id)
        if item:
            yield item
```

## Autenticación y Limitación de Velocidad

### Sistema de Autenticación JWT

#### Gestión de Tokens
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

#### Autenticación de Contexto
```python
async def get_context(request: Request, response: Response) -> Context:
    context = Context()
    
    # Extraer token del header Authorization
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

### Sistema Avanzado de Limitación de Velocidad

#### Limitación de Velocidad Multi-Nivel
```python
class AdvancedRateLimiter:
    async def check_rate_limit(
        self, request: Request, user_id: UUID = None, 
        tenant_id: UUID = None, subscription_tier: str = "basic"
    ) -> Optional[Dict[str, Any]]:
        # 1. Limitación de velocidad a nivel de tenant
        if tenant_id:
            tenant_limited = await self._check_tenant_limit(tenant_id, subscription_tier)
            if tenant_limited:
                return tenant_limited
        
        # 2. Limitación de velocidad a nivel de usuario
        if user_id:
            user_limited = await self._check_user_limit(user_id, subscription_tier)
            if user_limited:
                return user_limited
        
        # 3. Limitación de velocidad a nivel de IP para solicitudes no autenticadas
        else:
            ip_limited = await self._check_ip_limit(request)
            if ip_limited:
                return ip_limited
        
        return None
```

#### Implementación de Ventana Deslizante
```python
async def _is_rate_limited(
    self, key: str, limit: int, window_seconds: int
) -> tuple[bool, Dict[str, Any]]:
    current_time = int(time.time())
    window_start = current_time - window_seconds
    
    # Conjunto ordenado de Redis para ventana deslizante
    pipe = await self.redis._cluster.pipeline()
    
    # Remover entradas antiguas
    pipe.zremrangebyscore(key, 0, window_start)
    # Contar solicitudes actuales
    pipe.zcard(key)
    # Agregar solicitud actual
    pipe.zadd(key, {str(current_time): current_time})
    # Establecer expiración
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

#### Limitación de Velocidad de Operaciones GraphQL
```python
class GraphQLRateLimiter:
    def __init__(self):
        self.operation_limits = {
            "query": "2000/hour",
            "mutation": "1000/hour", 
            "subscription": "500/hour"
        }
        self.expensive_operations = {
            "recommend": 5,      # Cuesta 5 operaciones
            "similarItems": 3,   # Cuesta 3 operaciones
            "trainModel": 10     # Cuesta 10 operaciones
        }
    
    async def check_graphql_rate_limit(
        self, request: Request, operation_type: str, operation_name: str = None,
        user_id: UUID = None, tenant_id: UUID = None, subscription_tier: str = "basic"
    ):
        # Calcular costo de operación
        cost = self.expensive_operations.get(operation_name, 1)
        
        # Aplicar modificadores de tier de subscripción
        if subscription_tier == "basic":
            cost *= 2
        elif subscription_tier == "premium":
            cost *= 1.5
        
        # Verificar límites específicos de operación
        return await self._check_operation_limit(
            operation_type, cost, user_id, tenant_id, subscription_tier
        )
```

### Decoradores de Autorización

#### Requerir Autenticación
```python
def require_auth(func):
    @wraps(func)
    async def wrapper(self, info, *args, **kwargs):
        if not info.context.is_authenticated:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Autenticación requerida"
            )
        return await func(self, info, *args, **kwargs)
    return wrapper
```

#### Requerir Acceso de Tenant
```python
def require_tenant(func):
    @wraps(func)
    async def wrapper(self, info, *args, **kwargs):
        if not info.context.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso de tenant requerido"
            )
        return await func(self, info, *args, **kwargs)
    return wrapper
```

## Métricas de Rendimiento y Monitoreo

### Arquitectura de Recolección de Métricas

#### Integración con Prometheus
```python
class MetricsCollector:
    def __init__(self):
        # Métricas de solicitudes
        self.request_count = Counter(
            'graphql_requests_total',
            'Total de solicitudes GraphQL',
            ['operation_type', 'operation_name', 'tenant_id', 'status']
        )
        
        self.request_duration = Histogram(
            'graphql_request_duration_seconds',
            'Duración de solicitudes GraphQL',
            ['operation_type', 'operation_name', 'tenant_id']
        )
        
        # Métricas de recomendaciones
        self.recommendation_requests = Counter(
            'recommendation_requests_total',
            'Total de solicitudes de recomendación', 
            ['algorithm', 'tenant_id', 'status']
        )
        
        self.recommendation_duration = Histogram(
            'recommendation_duration_seconds',
            'Duración de generación de recomendaciones',
            ['algorithm', 'tenant_id']
        )
```

#### Gestor de Contexto de Seguimiento de Rendimiento
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

### Monitoreo de Salud

#### Verificaciones de Salud del Sistema
```python
async def get_health_status(self) -> Dict[str, Any]:
    current_metrics = await self.get_current_metrics()
    
    health_status = "healthy"
    issues = []
    
    # Umbral de tiempo de respuesta
    if current_metrics["average_response_time"] > 1.0:
        health_status = "degraded"
        issues.append("Tiempo de respuesta alto")
    
    # Umbral de tasa de error  
    if current_metrics["error_rate"] > 0.05:
        health_status = "unhealthy"
        issues.append("Tasa de error alta")
    
    # Umbral de tasa de aciertos de caché
    if current_metrics["cache_hit_rate"] < 0.8:
        if health_status == "healthy":
            health_status = "degraded"
        issues.append("Tasa de aciertos de caché baja")
    
    return {
        "status": health_status,
        "issues": issues,
        "metrics": current_metrics,
        "timestamp": datetime.utcnow().isoformat()
    }
```

### Gestión de Alertas

#### Sistema de Alertas
```python
class AlertManager:
    def __init__(self, metrics_collector: MetricsCollector):
        self.alert_thresholds = {
            "high_response_time": 2.0,      # segundos
            "high_error_rate": 0.1,         # 10%
            "low_cache_hit_rate": 0.7,      # 70%
            "high_recommendation_latency": 5000.0  # 5 segundos
        }
        self.alert_cooldowns = defaultdict(int)
        self.cooldown_period = 300  # 5 minutos
    
    async def check_alerts(self):
        current_time = int(time.time())
        health_status = await self.metrics_collector.get_health_status()
        
        # Verificar cada condición de alerta
        for alert_type, threshold in self.alert_thresholds.items():
            if self._should_trigger_alert(health_status, alert_type, threshold, current_time):
                await self._send_alert(alert_type, health_status)
                self.alert_cooldowns[alert_type] = current_time + self.cooldown_period
```

### Trazado Distribuido

#### Integración con OpenTelemetry
```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Configurar trazado
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

jaeger_exporter = JaegerExporter(
    agent_host_name="jaeger",
    agent_port=6831,
)

span_processor = BatchSpanProcessor(jaeger_exporter)
trace.get_tracer_provider().add_span_processor(span_processor)

# Uso en resolvers
@strawberry.field
async def recommendations(self, info, options: RecommendationOptions = None):
    with tracer.start_as_current_span("generate_recommendations") as span:
        span.set_attribute("user_id", str(info.context.user_id))
        span.set_attribute("algorithm", options.algorithm if options else "hybrid")
        
        # Lógica de recomendación
        recommendations = await self._generate_recommendations(info, options)
        
        span.set_attribute("recommendations_count", len(recommendations))
        return recommendations
```

## Estrategias de Pruebas

### Arquitectura de Pruebas

La estrategia de pruebas cubre múltiples niveles con cobertura integral:

```
tests/
├── unit/                    # Pruebas unitarias para componentes individuales
│   ├── test_auth.py        # Pruebas de lógica de autenticación
│   ├── test_cache.py       # Pruebas de operaciones de caché
│   └── test_recommendation_engines.py
├── integration/            # Pruebas de integración
│   └── test_graphql_api.py # Pruebas de endpoints GraphQL
├── e2e/                   # Pruebas de extremo a extremo
│   └── test_recommendation_flow.py
├── fixtures/              # Fixtures de datos de prueba
└── conftest.py           # Configuración de Pytest
```

### Pruebas Unitarias

#### Pruebas de Motores de Recomendación
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

#### Pruebas de Caché
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
        
        # Probar set
        result = await cache_manager.set_recommendations(
            user_id, algorithm, recommendations
        )
        assert result is True
        
        # Probar get
        cached = await cache_manager.get_recommendations(user_id, algorithm)
        assert cached == recommendations
    
    async def test_cache_invalidation(self, cache_manager):
        user_id = uuid.uuid4()
        
        # Establecer datos de usuario
        await cache_manager.set_user_data(user_id, {"email": "test@example.com"})
        
        # Invalidar
        await cache_manager.invalidate_user_cache(user_id)
        
        # Verificar eliminación
        cached_user = await cache_manager.get_user_data(user_id)
        assert cached_user is None
```

### Pruebas de Integración

#### Pruebas de API GraphQL
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
        # Probar limitación de velocidad haciendo múltiples solicitudes
        query = "query { performanceMetrics { queryCount } }"
        
        responses = []
        for _ in range(100):  # Exceder límite de velocidad
            response = await client.post(
                "/graphql",
                json={"query": query}
            )
            responses.append(response)
        
        # Eventualmente debería ser limitado por velocidad
        rate_limited = any(r.status_code == 429 for r in responses)
        assert rate_limited
```

### Pruebas de Extremo a Extremo

#### Flujo Completo de Recomendación
```python
# tests/e2e/test_recommendation_flow.py
import pytest
from httpx import AsyncClient

class TestRecommendationFlow:
    async def test_complete_recommendation_workflow(self, client, test_tenant):
        # 1. Registrar usuario
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
        
        # 2. Crear artículos
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
                        "title": f"Artículo de Prueba {i}",
                        "description": f"Descripción para artículo {i}",
                        "category": "electrónicos"
                    }
                }
            }, headers=headers)
            
            items.append(item_response.json()["data"]["createItem"])
        
        # 3. Registrar interacciones
        interaction_mutation = """
        mutation RecordInteraction($input: InteractionInput!) {
            recordInteraction(input: $input) {
                id
                interactionType
            }
        }
        """
        
        for item in items[:3]:  # Interactuar con los primeros 3 artículos
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
        
        # 4. Obtener recomendaciones
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
        
        # Verificar recomendaciones
        assert len(recommendations["items"]) > 0
        assert recommendations["responseTimeMs"] > 0
        assert all(item["score"] > 0 for item in recommendations["items"])
```

### Configuración de Pruebas

#### Configuración de Pytest
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
    """Crear loop de eventos para pruebas async."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(autouse=True)
async def setup_test_db():
    """Configurar base de datos de prueba antes de cada prueba."""
    await init_test_database()
    yield
    await cleanup_test_database()

@pytest.fixture
async def test_tenant():
    """Crear tenant de prueba."""
    tenant = Tenant(
        name="Tenant de Prueba",
        domain="test.example.com",
        subscription_tier="premium"
    )
    # Guardar en base de datos
    return tenant

@pytest.fixture
async def auth_headers(test_tenant):
    """Crear headers de autenticación."""
    # Crear usuario de prueba y generar token
    token = create_test_token(test_tenant.id)
    return {"Authorization": f"Bearer {token}"}
```

## Arquitectura de Despliegue

### Orquestación de Contenedores

#### Build Multi-Etapa de Docker
```dockerfile
# Build multi-etapa para optimización
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

### Despliegue de Kubernetes

#### Despliegue de API
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

#### Autoescalador Horizontal de Pods
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

### Componentes de Infraestructura

#### Despliegue de Redis Cluster
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

#### Despliegue de Base de Datos Vectorial
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

### Monitoreo y Observabilidad

#### Configuración de Prometheus
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

#### Configuración de Dashboard de Grafana
```json
{
  "dashboard": {
    "title": "API GraphQL de Recomendaciones",
    "panels": [
      {
        "title": "Tasa de Solicitudes",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(graphql_requests_total[5m])",
            "legendFormat": "{{operation_type}} - {{status}}"
          }
        ]
      },
      {
        "title": "Tiempo de Respuesta",
        "type": "graph", 
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(graphql_request_duration_seconds_bucket[5m]))",
            "legendFormat": "Percentil 95"
          }
        ]
      },
      {
        "title": "Rendimiento de Recomendaciones",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(recommendation_duration_seconds_bucket[5m]))",
            "legendFormat": "{{algorithm}} - Percentil 95"
          }
        ]
      }
    ]
  }
}
```

### Balanceador de Carga e Ingress

#### Balanceador de Carga Nginx
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
        
        # Soporte WebSocket
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

#### Ingress de Kubernetes
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

### Seguridad y Gestión de Secretos

#### Gestión de Secretos
```yaml
# k8s/api/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
  namespace: recommendation-system
type: Opaque
data:
  database-url: <url-base-datos-codificada-base64>
  secret-key: <clave-jwt-secreta-codificada-base64>
  redis-password: <contraseña-redis-codificada-base64>
  vector-db-api-key: <clave-api-bd-vectorial-codificada-base64>
```

Esta documentación técnica integral cubre todos los aspectos principales del sistema API GraphQL de Recomendaciones, desde la arquitectura y detalles de implementación hasta las estrategias de despliegue y monitoreo. El sistema demuestra patrones y prácticas de nivel empresarial para construir sistemas de recomendación escalables y de alto rendimiento.