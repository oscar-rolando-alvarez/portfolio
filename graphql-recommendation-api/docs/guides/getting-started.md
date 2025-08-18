# Getting Started Guide

This guide will help you set up and start using the GraphQL Recommendation API.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the API](#running-the-api)
- [First Steps](#first-steps)
- [Authentication Setup](#authentication-setup)
- [Creating Your First Recommendations](#creating-your-first-recommendations)
- [Next Steps](#next-steps)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.11+**
- **Docker & Docker Compose** (for easy setup)
- **PostgreSQL** (if running without Docker)
- **Redis** (if running without Docker)
- **Git**

### Optional but Recommended

- **Kubernetes** (for production deployment)
- **Vector Database** (Pinecone, Weaviate, or Qdrant account)

## Installation

### Option 1: Docker Compose (Recommended)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd graphql-recommendation-api
   ```

2. **Start the services:**
   ```bash
   docker-compose up -d
   ```

   This will start:
   - GraphQL API server
   - PostgreSQL database
   - Redis cluster
   - Qdrant vector database
   - Prometheus (metrics)
   - Grafana (monitoring dashboard)
   - Jaeger (tracing)

3. **Check that services are running:**
   ```bash
   docker-compose ps
   ```

### Option 2: Local Development

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd graphql-recommendation-api
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Setup environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Run database migrations:**
   ```bash
   alembic upgrade head
   ```

6. **Start the server:**
   ```bash
   python -m uvicorn app.main:app --reload
   ```

## Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost/graphql_recommendation

# Redis Cluster
REDIS_NODES=redis://localhost:7000,redis://localhost:7001,redis://localhost:7002

# Vector Database (choose one)
VECTOR_DB_PROVIDER=qdrant  # or pinecone, weaviate
QDRANT_URL=http://localhost:6333

# Authentication
SECRET_KEY=your-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Rate Limiting
RATE_LIMIT_DEFAULT=1000/hour
RATE_LIMIT_AUTHENTICATED=5000/hour

# Monitoring
ENABLE_PROMETHEUS=true
LOG_LEVEL=INFO
```

### Vector Database Setup

#### Qdrant (Default - Local)
No additional setup required if using Docker Compose.

#### Pinecone (Cloud)
1. Sign up at [Pinecone](https://www.pinecone.io/)
2. Get your API key and environment
3. Update `.env`:
   ```bash
   VECTOR_DB_PROVIDER=pinecone
   PINECONE_API_KEY=your-api-key
   PINECONE_ENVIRONMENT=your-environment
   ```

#### Weaviate (Cloud or Local)
1. Set up Weaviate instance
2. Update `.env`:
   ```bash
   VECTOR_DB_PROVIDER=weaviate
   WEAVIATE_URL=http://localhost:8080
   WEAVIATE_API_KEY=your-api-key  # if required
   ```

## Running the API

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

### Local Development

```bash
# Start the API server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# In another terminal, start Redis (if not using Docker)
redis-server --port 6379

# Start PostgreSQL (if not using Docker)
# Follow PostgreSQL installation instructions for your OS
```

## First Steps

### 1. Verify the API is Running

Visit the API endpoints:

- **GraphQL Playground:** http://localhost:8000/graphql
- **Health Check:** http://localhost:8000/health
- **API Documentation:** http://localhost:8000/docs
- **Metrics:** http://localhost:8000/metrics

### 2. Check System Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "components": {
    "database": "healthy",
    "redis": "healthy",
    "vector_db": "healthy"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 3. Access GraphQL Playground

Open http://localhost:8000/graphql in your browser to access the interactive GraphQL playground.

## Authentication Setup

### 1. Create a Tenant

First, you need a tenant. You can create one directly in the database or use the API:

```sql
-- Direct database insertion
INSERT INTO tenants (id, name, domain, is_active, subscription_tier)
VALUES (
  gen_random_uuid(),
  'Demo Company',
  'demo.example.com',
  true,
  'premium'
);
```

### 2. Register a User

Use the GraphQL playground to register your first user:

```graphql
mutation {
  register(input: {
    email: "admin@demo.example.com"
    username: "admin"
    password: "secure_password_123"
    tenantDomain: "demo.example.com"
  }) {
    accessToken
    refreshToken
    user {
      id
      email
      username
    }
    expiresIn
  }
}
```

### 3. Save the Access Token

Copy the `accessToken` from the response and use it for authenticated requests:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"
}
```

In GraphQL Playground, add this to the HTTP Headers section at the bottom.

## Creating Your First Recommendations

### 1. Create Some Items

```graphql
mutation {
  item1: createItem(input: {
    title: "Wireless Headphones"
    description: "High-quality wireless headphones with noise cancellation"
    category: "electronics"
    tags: ["audio", "wireless", "premium"]
    metadata: {
      brand: "TechCorp"
      price: 199.99
      color: "black"
    }
  }) {
    id
    title
  }
  
  item2: createItem(input: {
    title: "Programming Book"
    description: "Learn advanced programming techniques"
    category: "books"
    tags: ["programming", "education", "technology"]
    metadata: {
      author: "Jane Smith"
      pages: 450
      isbn: "978-1234567890"
    }
  }) {
    id
    title
  }
  
  item3: createItem(input: {
    title: "Coffee Maker"
    description: "Automatic coffee maker with timer"
    category: "appliances"
    tags: ["coffee", "kitchen", "automatic"]
    metadata: {
      brand: "BrewMaster"
      capacity: "12 cups"
      features: ["timer", "auto-shutoff"]
    }
  }) {
    id
    title
  }
}
```

### 2. Record Some Interactions

```graphql
mutation {
  # View the headphones
  view1: recordInteraction(input: {
    itemId: "ITEM_1_ID_FROM_ABOVE"
    interactionType: "view"
    interactionValue: 1.0
  }) {
    id
  }
  
  # Click on the programming book
  click1: recordInteraction(input: {
    itemId: "ITEM_2_ID_FROM_ABOVE"
    interactionType: "click"
    interactionValue: 2.0
  }) {
    id
  }
  
  # Purchase the coffee maker
  purchase1: recordInteraction(input: {
    itemId: "ITEM_3_ID_FROM_ABOVE"
    interactionType: "purchase"
    interactionValue: 5.0
  }) {
    id
  }
}
```

### 3. Rate Some Items

```graphql
mutation {
  rating1: rateItem(input: {
    itemId: "ITEM_1_ID_FROM_ABOVE"
    rating: 4.5
    review: "Great sound quality and comfortable fit!"
  }) {
    id
    rating
  }
  
  rating2: rateItem(input: {
    itemId: "ITEM_2_ID_FROM_ABOVE"
    rating: 5.0
    review: "Excellent book, very comprehensive and well-written."
  }) {
    id
    rating
  }
}
```

### 4. Get Your First Recommendations

```graphql
query {
  recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 5
    explain: true
  }) {
    items {
      item {
        id
        title
        category
        averageRating
      }
      score
      reason
    }
    algorithm
    totalCount
    responseTimeMs
    explanation {
      method
      explanation
    }
  }
}
```

### 5. Find Similar Items

```graphql
query {
  similarItems(itemId: "ITEM_1_ID_FROM_ABOVE", topK: 3) {
    item {
      id
      title
      category
    }
    score
    reason
  }
}
```

## Next Steps

### 1. Explore the API

- **Browse the Schema:** Use the GraphQL playground to explore all available queries, mutations, and subscriptions
- **Try Different Algorithms:** Experiment with different recommendation algorithms (`collaborative`, `content_based`, `matrix_factorization`, `hybrid`)
- **Use Filters:** Try filtering recommendations by category, score, or other criteria

### 2. Set Up Monitoring

- **Grafana Dashboard:** Visit http://localhost:3000 (admin/admin) to view monitoring dashboards
- **Prometheus Metrics:** Check http://localhost:9090 for raw metrics
- **Jaeger Tracing:** Visit http://localhost:16686 for distributed tracing

### 3. Scale Your Setup

- **Add More Data:** Import larger datasets to see the recommendation engine's performance
- **Tune Algorithms:** Experiment with different algorithm parameters
- **Performance Testing:** Use the provided test suite to benchmark performance

### 4. Production Deployment

- **Kubernetes:** Use the provided K8s manifests for production deployment
- **Environment Variables:** Update all production-specific configuration
- **Security:** Change default passwords and API keys
- **Monitoring:** Set up proper alerting and monitoring

### 5. Integration

- **Client Libraries:** Integrate with your frontend applications
- **Webhooks:** Set up real-time event processing
- **Analytics:** Connect with your analytics pipeline

## Common Issues and Solutions

### Database Connection Issues

```bash
# Check database status
docker-compose exec postgres pg_isready

# View database logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d
```

### Redis Cluster Issues

```bash
# Check Redis cluster status
docker-compose exec redis-node-1 redis-cli cluster nodes

# Reset Redis cluster
docker-compose restart redis-cluster-setup
```

### Memory Issues

If you're running into memory issues:

1. **Reduce the number of factors in matrix factorization:**
   ```bash
   MF_FACTORS=50  # Default is 100
   ```

2. **Limit the number of items processed:**
   ```bash
   MAX_NUM_RECOMMENDATIONS=50  # Default is 100
   ```

3. **Increase Docker memory limits** in `docker-compose.yml`

### Performance Issues

1. **Check cache hit rates:**
   ```graphql
   query {
     performanceMetrics {
       cacheHitRate
       averageResponseTime
     }
   }
   ```

2. **Monitor recommendation response times:**
   ```graphql
   query {
     recommendations {
       responseTimeMs
     }
   }
   ```

3. **Use the monitoring dashboard** to identify bottlenecks

## Support

- **Documentation:** Check the `/docs` folder for detailed documentation
- **Examples:** See `/docs/examples` for more usage examples
- **Issues:** Report issues on the GitHub repository
- **Performance:** Use the monitoring tools to diagnose performance issues

You're now ready to start building powerful recommendation systems with the GraphQL Recommendation API!