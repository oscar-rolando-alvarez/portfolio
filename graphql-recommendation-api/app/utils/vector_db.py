"""Vector database integration for similarity search."""
import uuid
import numpy as np
from typing import List, Dict, Any, Optional, Tuple, Union
from abc import ABC, abstractmethod
import asyncio
import logging

# Vector database clients
try:
    import pinecone
except ImportError:
    pinecone = None

try:
    import weaviate
except ImportError:
    weaviate = None

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
except ImportError:
    QdrantClient = None

from app.config import settings

logger = logging.getLogger(__name__)


class BaseVectorDB(ABC):
    """Base class for vector database operations."""
    
    @abstractmethod
    async def connect(self):
        """Connect to the vector database."""
        pass
    
    @abstractmethod
    async def disconnect(self):
        """Disconnect from the vector database."""
        pass
    
    @abstractmethod
    async def create_collection(self, name: str, dimension: int, **kwargs):
        """Create a collection/index."""
        pass
    
    @abstractmethod
    async def upsert_vectors(
        self,
        collection: str,
        vectors: List[Dict[str, Any]]
    ):
        """Insert or update vectors."""
        pass
    
    @abstractmethod
    async def search_similar(
        self,
        collection: str,
        query_vector: List[float],
        top_k: int = 10,
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors."""
        pass
    
    @abstractmethod
    async def delete_vectors(self, collection: str, ids: List[str]):
        """Delete vectors by IDs."""
        pass


class PineconeVectorDB(BaseVectorDB):
    """Pinecone vector database integration."""
    
    def __init__(self):
        if not pinecone:
            raise ImportError("pinecone-client is required for Pinecone integration")
        
        self.client = None
        self.index = None
        self.connected = False
    
    async def connect(self):
        """Connect to Pinecone."""
        try:
            pinecone.init(
                api_key=settings.vector_db.pinecone_api_key,
                environment=settings.vector_db.pinecone_environment
            )
            
            # Check if index exists, create if not
            if settings.vector_db.pinecone_index_name not in pinecone.list_indexes():
                await self.create_collection(
                    settings.vector_db.pinecone_index_name,
                    dimension=512  # Default dimension
                )
            
            self.index = pinecone.Index(settings.vector_db.pinecone_index_name)
            self.connected = True
            logger.info("Connected to Pinecone")
            
        except Exception as e:
            logger.error(f"Failed to connect to Pinecone: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Pinecone."""
        self.connected = False
        logger.info("Disconnected from Pinecone")
    
    async def create_collection(self, name: str, dimension: int, **kwargs):
        """Create a Pinecone index."""
        try:
            pinecone.create_index(
                name=name,
                dimension=dimension,
                metric=kwargs.get('metric', 'cosine'),
                pods=kwargs.get('pods', 1),
                replicas=kwargs.get('replicas', 1),
                pod_type=kwargs.get('pod_type', 'p1.x1')
            )
            logger.info(f"Created Pinecone index: {name}")
        except Exception as e:
            logger.error(f"Failed to create Pinecone index {name}: {e}")
            raise
    
    async def upsert_vectors(
        self,
        collection: str,
        vectors: List[Dict[str, Any]]
    ):
        """Upsert vectors to Pinecone."""
        if not self.connected:
            await self.connect()
        
        try:
            # Convert to Pinecone format
            pinecone_vectors = []
            for vector_data in vectors:
                pinecone_vectors.append({
                    'id': str(vector_data['id']),
                    'values': vector_data['vector'],
                    'metadata': vector_data.get('metadata', {})
                })
            
            # Batch upsert
            batch_size = 100
            for i in range(0, len(pinecone_vectors), batch_size):
                batch = pinecone_vectors[i:i + batch_size]
                self.index.upsert(vectors=batch)
            
            logger.info(f"Upserted {len(vectors)} vectors to Pinecone")
            
        except Exception as e:
            logger.error(f"Failed to upsert vectors to Pinecone: {e}")
            raise
    
    async def search_similar(
        self,
        collection: str,
        query_vector: List[float],
        top_k: int = 10,
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors in Pinecone."""
        if not self.connected:
            await self.connect()
        
        try:
            results = self.index.query(
                vector=query_vector,
                top_k=top_k,
                include_metadata=True,
                filter=filter_conditions
            )
            
            formatted_results = []
            for match in results['matches']:
                formatted_results.append({
                    'id': match['id'],
                    'score': float(match['score']),
                    'metadata': match.get('metadata', {})
                })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Failed to search vectors in Pinecone: {e}")
            return []
    
    async def delete_vectors(self, collection: str, ids: List[str]):
        """Delete vectors from Pinecone."""
        if not self.connected:
            await self.connect()
        
        try:
            self.index.delete(ids=ids)
            logger.info(f"Deleted {len(ids)} vectors from Pinecone")
        except Exception as e:
            logger.error(f"Failed to delete vectors from Pinecone: {e}")
            raise


class WeaviateVectorDB(BaseVectorDB):
    """Weaviate vector database integration."""
    
    def __init__(self):
        if not weaviate:
            raise ImportError("weaviate-client is required for Weaviate integration")
        
        self.client = None
        self.connected = False
    
    async def connect(self):
        """Connect to Weaviate."""
        try:
            auth_config = None
            if settings.vector_db.weaviate_api_key:
                auth_config = weaviate.AuthApiKey(api_key=settings.vector_db.weaviate_api_key)
            
            self.client = weaviate.Client(
                url=settings.vector_db.weaviate_url,
                auth_client_secret=auth_config
            )
            
            # Test connection
            self.client.schema.get()
            self.connected = True
            logger.info("Connected to Weaviate")
            
        except Exception as e:
            logger.error(f"Failed to connect to Weaviate: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Weaviate."""
        self.connected = False
        logger.info("Disconnected from Weaviate")
    
    async def create_collection(self, name: str, dimension: int, **kwargs):
        """Create a Weaviate class."""
        try:
            class_obj = {
                "class": name,
                "vectorizer": "none",  # We'll provide our own vectors
                "properties": [
                    {
                        "name": "item_id",
                        "dataType": ["string"],
                        "description": "Item ID"
                    },
                    {
                        "name": "metadata",
                        "dataType": ["object"],
                        "description": "Item metadata"
                    }
                ]
            }
            
            self.client.schema.create_class(class_obj)
            logger.info(f"Created Weaviate class: {name}")
            
        except Exception as e:
            logger.error(f"Failed to create Weaviate class {name}: {e}")
            raise
    
    async def upsert_vectors(
        self,
        collection: str,
        vectors: List[Dict[str, Any]]
    ):
        """Upsert vectors to Weaviate."""
        if not self.connected:
            await self.connect()
        
        try:
            # Batch upsert
            with self.client.batch as batch:
                batch.batch_size = 100
                
                for vector_data in vectors:
                    properties = {
                        "item_id": str(vector_data['id']),
                        "metadata": vector_data.get('metadata', {})
                    }
                    
                    batch.add_data_object(
                        data_object=properties,
                        class_name=collection,
                        uuid=str(vector_data['id']),
                        vector=vector_data['vector']
                    )
            
            logger.info(f"Upserted {len(vectors)} vectors to Weaviate")
            
        except Exception as e:
            logger.error(f"Failed to upsert vectors to Weaviate: {e}")
            raise
    
    async def search_similar(
        self,
        collection: str,
        query_vector: List[float],
        top_k: int = 10,
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors in Weaviate."""
        if not self.connected:
            await self.connect()
        
        try:
            near_vector = {"vector": query_vector}
            
            query = self.client.query.get(collection, ["item_id", "metadata"]) \
                .with_near_vector(near_vector) \
                .with_limit(top_k) \
                .with_additional(["certainty", "distance"])
            
            if filter_conditions:
                query = query.with_where(filter_conditions)
            
            results = query.do()
            
            formatted_results = []
            if 'data' in results and 'Get' in results['data']:
                for item in results['data']['Get'].get(collection, []):
                    formatted_results.append({
                        'id': item['item_id'],
                        'score': float(item['_additional']['certainty']),
                        'metadata': item.get('metadata', {})
                    })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Failed to search vectors in Weaviate: {e}")
            return []
    
    async def delete_vectors(self, collection: str, ids: List[str]):
        """Delete vectors from Weaviate."""
        if not self.connected:
            await self.connect()
        
        try:
            for vector_id in ids:
                self.client.data_object.delete(
                    uuid=vector_id,
                    class_name=collection
                )
            
            logger.info(f"Deleted {len(ids)} vectors from Weaviate")
            
        except Exception as e:
            logger.error(f"Failed to delete vectors from Weaviate: {e}")
            raise


class QdrantVectorDB(BaseVectorDB):
    """Qdrant vector database integration."""
    
    def __init__(self):
        if not QdrantClient:
            raise ImportError("qdrant-client is required for Qdrant integration")
        
        self.client = None
        self.connected = False
    
    async def connect(self):
        """Connect to Qdrant."""
        try:
            self.client = QdrantClient(
                url=settings.vector_db.qdrant_url,
                api_key=settings.vector_db.qdrant_api_key
            )
            
            # Test connection
            collections = self.client.get_collections()
            self.connected = True
            logger.info("Connected to Qdrant")
            
        except Exception as e:
            logger.error(f"Failed to connect to Qdrant: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Qdrant."""
        self.connected = False
        logger.info("Disconnected from Qdrant")
    
    async def create_collection(self, name: str, dimension: int, **kwargs):
        """Create a Qdrant collection."""
        try:
            self.client.create_collection(
                collection_name=name,
                vectors_config=models.VectorParams(
                    size=dimension,
                    distance=models.Distance.COSINE
                )
            )
            logger.info(f"Created Qdrant collection: {name}")
            
        except Exception as e:
            logger.error(f"Failed to create Qdrant collection {name}: {e}")
            raise
    
    async def upsert_vectors(
        self,
        collection: str,
        vectors: List[Dict[str, Any]]
    ):
        """Upsert vectors to Qdrant."""
        if not self.connected:
            await self.connect()
        
        try:
            points = []
            for vector_data in vectors:
                points.append(models.PointStruct(
                    id=str(vector_data['id']),
                    vector=vector_data['vector'],
                    payload=vector_data.get('metadata', {})
                ))
            
            self.client.upsert(
                collection_name=collection,
                points=points
            )
            
            logger.info(f"Upserted {len(vectors)} vectors to Qdrant")
            
        except Exception as e:
            logger.error(f"Failed to upsert vectors to Qdrant: {e}")
            raise
    
    async def search_similar(
        self,
        collection: str,
        query_vector: List[float],
        top_k: int = 10,
        filter_conditions: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar vectors in Qdrant."""
        if not self.connected:
            await self.connect()
        
        try:
            search_filter = None
            if filter_conditions:
                search_filter = models.Filter(**filter_conditions)
            
            results = self.client.search(
                collection_name=collection,
                query_vector=query_vector,
                limit=top_k,
                query_filter=search_filter,
                with_payload=True
            )
            
            formatted_results = []
            for result in results:
                formatted_results.append({
                    'id': result.id,
                    'score': float(result.score),
                    'metadata': result.payload or {}
                })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Failed to search vectors in Qdrant: {e}")
            return []
    
    async def delete_vectors(self, collection: str, ids: List[str]):
        """Delete vectors from Qdrant."""
        if not self.connected:
            await self.connect()
        
        try:
            self.client.delete(
                collection_name=collection,
                points_selector=models.PointIdsList(
                    points=ids
                )
            )
            
            logger.info(f"Deleted {len(ids)} vectors from Qdrant")
            
        except Exception as e:
            logger.error(f"Failed to delete vectors from Qdrant: {e}")
            raise


class VectorDBManager:
    """Manager for vector database operations."""
    
    def __init__(self):
        self.db: Optional[BaseVectorDB] = None
        self._initialize_db()
    
    def _initialize_db(self):
        """Initialize the vector database based on configuration."""
        provider = settings.vector_db.provider.lower()
        
        if provider == "pinecone":
            self.db = PineconeVectorDB()
        elif provider == "weaviate":
            self.db = WeaviateVectorDB()
        elif provider == "qdrant":
            self.db = QdrantVectorDB()
        else:
            logger.warning(f"Unknown vector database provider: {provider}")
            # Default to Qdrant if available
            try:
                self.db = QdrantVectorDB()
            except ImportError:
                logger.error("No vector database available")
    
    async def connect(self):
        """Connect to the vector database."""
        if self.db:
            await self.db.connect()
    
    async def disconnect(self):
        """Disconnect from the vector database."""
        if self.db:
            await self.db.disconnect()
    
    async def store_item_vectors(
        self,
        items: List[Dict[str, Any]],
        collection: str = "items"
    ):
        """Store item vectors in the database."""
        if not self.db:
            return
        
        vectors = []
        for item in items:
            if 'vector' in item and 'id' in item:
                vectors.append({
                    'id': item['id'],
                    'vector': item['vector'],
                    'metadata': {
                        'title': item.get('title', ''),
                        'category': item.get('category', ''),
                        'tags': item.get('tags', []),
                        'tenant_id': str(item.get('tenant_id', ''))
                    }
                })
        
        if vectors:
            await self.db.upsert_vectors(collection, vectors)
    
    async def find_similar_items(
        self,
        query_vector: List[float],
        top_k: int = 10,
        tenant_id: Optional[uuid.UUID] = None,
        category: Optional[str] = None,
        collection: str = "items"
    ) -> List[Dict[str, Any]]:
        """Find similar items using vector search."""
        if not self.db:
            return []
        
        # Build filter conditions
        filter_conditions = {}
        if tenant_id:
            filter_conditions['tenant_id'] = str(tenant_id)
        if category:
            filter_conditions['category'] = category
        
        return await self.db.search_similar(
            collection=collection,
            query_vector=query_vector,
            top_k=top_k,
            filter_conditions=filter_conditions if filter_conditions else None
        )
    
    async def delete_item_vectors(
        self,
        item_ids: List[uuid.UUID],
        collection: str = "items"
    ):
        """Delete item vectors from the database."""
        if not self.db:
            return
        
        string_ids = [str(item_id) for item_id in item_ids]
        await self.db.delete_vectors(collection, string_ids)


# Global vector database manager
vector_db_manager = VectorDBManager()