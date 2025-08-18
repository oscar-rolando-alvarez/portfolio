# Advanced Usage Examples

This document provides advanced examples and integration patterns for the GraphQL Recommendation API.

## Table of Contents

- [Batch Operations](#batch-operations)
- [Complex Filtering](#complex-filtering)
- [A/B Testing Recommendations](#ab-testing-recommendations)
- [Real-time Analytics](#real-time-analytics)
- [Custom Recommendation Strategies](#custom-recommendation-strategies)
- [Performance Optimization](#performance-optimization)
- [Multi-tenant Usage](#multi-tenant-usage)
- [Integration Patterns](#integration-patterns)

## Batch Operations

### Batch Item Creation

```graphql
mutation CreateMultipleItems {
  item1: createItem(input: {
    title: "Product A"
    category: "electronics"
    tags: ["gadget", "mobile"]
  }) {
    id
    title
  }
  
  item2: createItem(input: {
    title: "Product B"
    category: "electronics" 
    tags: ["gadget", "laptop"]
  }) {
    id
    title
  }
  
  item3: createItem(input: {
    title: "Product C"
    category: "books"
    tags: ["fiction", "mystery"]
  }) {
    id
    title
  }
}
```

### Batch Interaction Recording

```graphql
mutation RecordUserSession($sessionId: String!) {
  view1: recordInteraction(input: {
    itemId: "item-1-uuid"
    interactionType: "view"
    sessionId: $sessionId
    context: {step: 1, duration: 30}
  }) { id }
  
  view2: recordInteraction(input: {
    itemId: "item-2-uuid"
    interactionType: "view"
    sessionId: $sessionId
    context: {step: 2, duration: 45}
  }) { id }
  
  click: recordInteraction(input: {
    itemId: "item-2-uuid"
    interactionType: "click"
    sessionId: $sessionId
    context: {step: 3, element: "add_to_cart"}
  }) { id }
  
  purchase: recordInteraction(input: {
    itemId: "item-2-uuid"
    interactionType: "purchase"
    interactionValue: 10.0
    sessionId: $sessionId
    context: {step: 4, amount: 299.99}
  }) { id }
}
```

## Complex Filtering

### Multi-faceted Recommendations

```graphql
query GetFilteredRecommendations($userId: UUID!) {
  # Electronics recommendations
  electronics: recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 10
    filters: {
      categories: ["electronics"]
      minScore: 0.7
    }
  }) {
    items {
      item {
        id
        title
        category
        metadata
      }
      score
    }
    totalCount
  }
  
  # High-rated books
  books: recommendations(options: {
    algorithm: "content_based"
    numRecommendations: 5
    filters: {
      categories: ["books"]
      minScore: 0.8
    }
  }) {
    items {
      item {
        id
        title
        averageRating
      }
      score
    }
  }
  
  # Trending items (recent interactions)
  trending: recommendations(options: {
    algorithm: "collaborative"
    numRecommendations: 15
    filters: {
      maxAgeDays: 7
      minScore: 0.6
    }
  }) {
    items {
      item {
        id
        title
        popularityScore
      }
      score
    }
  }
}
```

### Dynamic Category Recommendations

```graphql
query CategoryBasedRecommendations($categories: [String!]!, $excludeCategories: [String!]) {
  recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 20
    diversify: true
    filters: {
      categories: $categories
      excludeCategories: $excludeCategories
      minScore: 0.5
    }
  }) {
    items {
      item {
        id
        title
        category
        tags
        popularityScore
      }
      score
      reason
    }
    algorithm
    totalCount
  }
}
```

Variables:
```json
{
  "categories": ["electronics", "books", "home"],
  "excludeCategories": ["adult_content", "discontinued"]
}
```

## A/B Testing Recommendations

### Algorithm Comparison

```graphql
query CompareAlgorithms {
  collaborative: recommendations(options: {
    algorithm: "collaborative"
    numRecommendations: 10
    explain: true
  }) {
    items {
      item { id title }
      score
    }
    algorithm
    responseTimeMs
    explanation {
      method
      explanation
    }
  }
  
  contentBased: recommendations(options: {
    algorithm: "content_based"
    numRecommendations: 10
    explain: true
  }) {
    items {
      item { id title }
      score
    }
    algorithm
    responseTimeMs
    explanation {
      method
      explanation
    }
  }
  
  hybrid: recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 10
    explain: true
  }) {
    items {
      item { id title }
      score
    }
    algorithm
    responseTimeMs
    explanation {
      method
      explanation
    }
  }
}
```

### Personalization vs Popularity

```graphql
query PersonalizationVsPopularity {
  personalized: recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 10
    diversify: true
  }) {
    items {
      item {
        id
        title
        category
        popularityScore
      }
      score
      reason
    }
  }
  
  popular: items(limit: 10) {
    id
    title
    category
    popularityScore
    averageRating
  }
}
```

## Real-time Analytics

### Comprehensive User Analytics

```graphql
query UserAnalytics($userId: UUID!) {
  user(userId: $userId) {
    id
    email
    username
    
    # Recent interactions
    recentViews: interactions(interactionType: "view") {
      id
      item {
        id
        title
        category
      }
      createdAt
    }
    
    # Purchase history
    purchases: interactions(interactionType: "purchase") {
      id
      interactionValue
      item {
        id
        title
        category
        metadata
      }
      createdAt
    }
    
    # Ratings given
    ratings {
      id
      rating
      review
      item {
        id
        title
        category
      }
      createdAt
    }
  }
  
  # Recommendations for this user
  recommendations(options: {
    numRecommendations: 5
    explain: true
  }) {
    items {
      item {
        id
        title
        category
      }
      score
      reason
    }
    explanation {
      method
      explanation
    }
  }
}
```

### Item Performance Analytics

```graphql
query ItemAnalytics($itemId: UUID!) {
  item(itemId: $itemId) {
    id
    title
    category
    popularityScore
    averageRating
    
    # Interaction breakdown
    views: interactions(interactionType: "view") {
      id
      user {
        username
      }
      createdAt
    }
    
    clicks: interactions(interactionType: "click") {
      id
      user {
        username
      }
      createdAt
    }
    
    purchases: interactions(interactionType: "purchase") {
      id
      interactionValue
      user {
        username
      }
      createdAt
    }
    
    # Reviews and ratings
    ratings {
      id
      rating
      review
      user {
        username
      }
      createdAt
    }
    
    # Similar items
    similarItems(topK: 5) {
      item {
        id
        title
        category
      }
      similarityScore
    }
  }
}
```

## Custom Recommendation Strategies

### Context-Aware Recommendations

```graphql
query ContextAwareRecommendations($context: String!) {
  # Different recommendations based on context
  homePageRecs: recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 8
    diversify: true
    filters: {
      minScore: 0.6
    }
  }) {
    items {
      item {
        id
        title
        category
        popularityScore
      }
      score
    }
  }
  
  # Category-specific recommendations
  categoryRecs: recommendations(options: {
    algorithm: "content_based"
    numRecommendations: 12
    filters: {
      categories: ["electronics"] # Dynamic based on current category
      minScore: 0.5
    }
  }) {
    items {
      item {
        id
        title
        category
      }
      score
    }
  }
}
```

### Seasonal/Temporal Recommendations

```graphql
query SeasonalRecommendations($season: String!, $timeOfDay: String!) {
  seasonal: recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 10
    filters: {
      # This would be implemented with custom metadata filtering
      minScore: 0.5
    }
  }) {
    items {
      item {
        id
        title
        category
        metadata # Contains seasonal relevance
        tags
      }
      score
      reason
    }
  }
}
```

## Performance Optimization

### Optimized Query with Fragments

```graphql
fragment ItemBasic on Item {
  id
  title
  category
  popularityScore
}

fragment ItemDetailed on Item {
  ...ItemBasic
  description
  tags
  metadata
  averageRating
  createdAt
}

fragment RecommendationItem on RecommendationItem {
  score
  reason
  item {
    ...ItemBasic
  }
}

query OptimizedRecommendations {
  quickRecs: recommendations(options: {
    numRecommendations: 5
    algorithm: "hybrid"
  }) {
    items {
      ...RecommendationItem
    }
    responseTimeMs
  }
  
  detailedRecs: recommendations(options: {
    numRecommendations: 10
    algorithm: "content_based"
    explain: true
  }) {
    items {
      score
      reason
      item {
        ...ItemDetailed
      }
    }
    explanation {
      method
      explanation
    }
  }
}
```

### Pagination with Cursor-based Navigation

```graphql
query PaginatedItems($after: String, $limit: Int = 20) {
  items(limit: $limit, offset: 0) {
    id
    title
    category
    popularityScore
    createdAt
  }
  
  # For pagination, you'd typically use cursor-based pagination
  # This is a simplified example
}
```

## Multi-tenant Usage

### Tenant-specific Recommendations

```graphql
query TenantRecommendations {
  me {
    id
    tenant {
      id
      name
      subscriptionTier
      settings
    }
  }
  
  # Recommendations will automatically be filtered by tenant
  recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 15
    diversify: true
  }) {
    items {
      item {
        id
        title
        category
        # All items belong to the same tenant
      }
      score
    }
    algorithm
  }
  
  # Items in the tenant
  items(limit: 20) {
    id
    title
    category
    popularityScore
  }
}
```

### Cross-tenant Analytics (Admin)

```graphql
query AdminAnalytics {
  # This would require admin privileges
  performanceMetrics {
    queryCount
    averageResponseTime
    cacheHitRate
    errorRate
    timestamp
  }
  
  rateLimitStatus {
    currentCount
    limit
    remaining
    windowSeconds
  }
}
```

## Integration Patterns

### E-commerce Integration

```graphql
# Product recommendation for e-commerce site
query EcommerceRecommendations($productId: UUID, $userId: UUID) {
  # Product page recommendations
  similarProducts: similarItems(itemId: $productId, topK: 8) {
    item {
      id
      title
      category
      metadata # Contains price, brand, etc.
      averageRating
    }
    score
  }
  
  # User personalized recommendations
  forYou: recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 12
    diversify: true
    filters: {
      minScore: 0.4
    }
  }) {
    items {
      item {
        id
        title
        category
        metadata
        popularityScore
      }
      score
      reason
    }
  }
  
  # Trending products
  trending: items(limit: 10) {
    id
    title
    category
    popularityScore
    averageRating
    metadata
  }
}
```

### Content Platform Integration

```graphql
# Content recommendation for media platform
query ContentRecommendations($currentContentId: UUID) {
  # Continue watching / reading
  recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 10
    filters: {
      categories: ["video", "audio", "article"]
      minScore: 0.6
    }
  }) {
    items {
      item {
        id
        title
        category
        metadata # Contains duration, genre, etc.
        tags
      }
      score
      reason
    }
  }
  
  # Related content
  relatedContent: similarItems(itemId: $currentContentId, topK: 6) {
    item {
      id
      title
      category
      metadata
      averageRating
    }
    score
  }
}
```

### Real-time Event Processing

```graphql
# Subscribe to real-time events for analytics
subscription RealTimeEvents {
  # New interactions
  userActivity
  
  # Performance monitoring
  performanceMetricsStream(intervalSeconds: 30) {
    queryCount
    averageResponseTime
    cacheHitRate
    errorRate
    timestamp
  }
}
```

### Webhook Integration Simulation

```graphql
# Record webhook-style events
mutation ProcessWebhookEvent($eventType: String!, $eventData: JSON!) {
  recordInteraction(input: {
    itemId: "extracted-from-event"
    interactionType: $eventType
    context: $eventData
  }) {
    id
    interactionType
    item {
      title
    }
    createdAt
  }
}
```

Variables:
```json
{
  "eventType": "purchase",
  "eventData": {
    "orderId": "order-123",
    "amount": 99.99,
    "source": "mobile_app",
    "timestamp": "2024-01-15T14:30:00Z"
  }
}
```

## Error Handling and Monitoring

### Comprehensive Error Handling

```graphql
query SafeRecommendations {
  recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 10
  }) {
    items {
      item {
        id
        title
        category
      }
      score
    }
    algorithm
    responseTimeMs
  }
  
  # Fallback to popular items if recommendations fail
  fallback: items(limit: 10) {
    id
    title
    category
    popularityScore
  }
  
  # Check system health
  rateLimitStatus {
    remaining
    limit
  }
}
```

This query structure allows the client to handle partial failures gracefully and always return some content to users.