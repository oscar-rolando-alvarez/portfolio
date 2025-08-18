# Basic Usage Examples

This document provides basic examples of how to use the GraphQL Recommendation API.

## Table of Contents

- [Authentication](#authentication)
- [User Management](#user-management)
- [Item Management](#item-management)
- [Recording Interactions](#recording-interactions)
- [Getting Recommendations](#getting-recommendations)
- [Rating Items](#rating-items)
- [Real-time Subscriptions](#real-time-subscriptions)

## Authentication

### Register a New User

```graphql
mutation {
  register(input: {
    email: "user@example.com"
    username: "johndoe"
    password: "secure_password_123"
    tenantDomain: "mycompany.com"
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

### Login

```graphql
mutation {
  login(input: {
    email: "user@example.com"
    password: "secure_password_123"
  }) {
    accessToken
    refreshToken
    user {
      id
      email
      username
      tenant {
        name
        subscriptionTier
      }
    }
    expiresIn
  }
}
```

### Get Current User

```graphql
query {
  me {
    id
    email
    username
    isVerified
    tenant {
      name
      domain
      subscriptionTier
    }
    preferences
  }
}
```

## User Management

### Get Users in Tenant

```graphql
query {
  users(limit: 20, offset: 0) {
    id
    email
    username
    isActive
    createdAt
  }
}
```

### Get Specific User

```graphql
query {
  user(userId: "123e4567-e89b-12d3-a456-426614174000") {
    id
    email
    username
    interactions(interactionType: "purchase") {
      id
      interactionType
      item {
        title
      }
      createdAt
    }
  }
}
```

## Item Management

### Create an Item

```graphql
mutation {
  createItem(input: {
    title: "Awesome Product"
    description: "This is an amazing product that everyone will love"
    category: "electronics"
    tags: ["gadget", "popular", "tech"]
    metadata: {
      brand: "TechCorp"
      price: 299.99
      inStock: true
    }
    contentFeatures: {
      features: ["wireless", "waterproof", "durable"]
      colors: ["black", "white", "blue"]
    }
  }) {
    id
    title
    description
    category
    tags
    popularityScore
    createdAt
  }
}
```

### Get Items

```graphql
query {
  items(category: "electronics", limit: 10) {
    id
    title
    description
    category
    popularityScore
    averageRating
    ratings {
      rating
      review
      user {
        username
      }
    }
  }
}
```

### Search Items

```graphql
query {
  items(search: "wireless headphones", limit: 5) {
    id
    title
    description
    category
    popularityScore
  }
}
```

### Get Item Details

```graphql
query {
  item(itemId: "123e4567-e89b-12d3-a456-426614174000") {
    id
    title
    description
    category
    tags
    metadata
    averageRating
    ratings {
      rating
      review
      user {
        username
      }
      createdAt
    }
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

## Recording Interactions

### Record a View

```graphql
mutation {
  recordInteraction(input: {
    itemId: "123e4567-e89b-12d3-a456-426614174000"
    interactionType: "view"
    interactionValue: 1.0
    sessionId: "session_abc123"
    context: {
      page: "product_detail"
      referrer: "search_results"
      timestamp: "2024-01-15T10:30:00Z"
    }
  }) {
    id
    interactionType
    interactionValue
    item {
      id
      title
    }
    createdAt
  }
}
```

### Record a Purchase

```graphql
mutation {
  recordInteraction(input: {
    itemId: "123e4567-e89b-12d3-a456-426614174000"
    interactionType: "purchase"
    interactionValue: 5.0
    context: {
      price: 299.99
      quantity: 1
      payment_method: "credit_card"
    }
  }) {
    id
    interactionType
    interactionValue
    item {
      id
      title
    }
    user {
      username
    }
    createdAt
  }
}
```

### Record Multiple Interactions

```graphql
mutation RecordView($itemId1: UUID!, $itemId2: UUID!) {
  interaction1: recordInteraction(input: {
    itemId: $itemId1
    interactionType: "view"
  }) {
    id
    item { title }
  }
  
  interaction2: recordInteraction(input: {
    itemId: $itemId2
    interactionType: "click"
    interactionValue: 2.0
  }) {
    id
    item { title }
  }
}
```

Variables:
```json
{
  "itemId1": "123e4567-e89b-12d3-a456-426614174000",
  "itemId2": "456e7890-e89b-12d3-a456-426614174001"
}
```

## Getting Recommendations

### Basic Recommendations

```graphql
query {
  recommendations {
    items {
      item {
        id
        title
        category
        description
      }
      score
      reason
    }
    algorithm
    totalCount
    responseTimeMs
  }
}
```

### Recommendations with Options

```graphql
query {
  recommendations(options: {
    algorithm: "hybrid"
    numRecommendations: 20
    diversify: true
    explain: true
    filters: {
      categories: ["electronics", "books"]
      minScore: 0.5
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
      reason
      metadata
    }
    algorithm
    totalCount
    responseTimeMs
    explanation {
      method
      explanation
      metadata
    }
  }
}
```

### Content-Based Recommendations

```graphql
query {
  recommendations(options: {
    algorithm: "content_based"
    numRecommendations: 10
    filters: {
      excludeCategories: ["adult_content"]
      minScore: 0.3
    }
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
    algorithm
  }
}
```

### Similar Items

```graphql
query {
  similarItems(
    itemId: "123e4567-e89b-12d3-a456-426614174000"
    topK: 10
  ) {
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
```

## Rating Items

### Rate an Item

```graphql
mutation {
  rateItem(input: {
    itemId: "123e4567-e89b-12d3-a456-426614174000"
    rating: 4.5
    review: "Great product! Really satisfied with the quality and performance."
  }) {
    id
    rating
    review
    item {
      id
      title
      averageRating
    }
    createdAt
  }
}
```

### Update an Existing Rating

```graphql
mutation {
  rateItem(input: {
    itemId: "123e4567-e89b-12d3-a456-426614174000"
    rating: 5.0
    review: "Updated review: Even better than I initially thought!"
  }) {
    id
    rating
    review
    item {
      id
      title
      averageRating
    }
    createdAt
  }
}
```

## Real-time Subscriptions

### Subscribe to Recommendation Updates

```graphql
subscription {
  recommendationUpdates(algorithm: "hybrid") {
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

### Subscribe to Item Interactions

```graphql
subscription {
  itemInteractions(itemId: "123e4567-e89b-12d3-a456-426614174000") {
    id
    interactionType
    user {
      username
    }
    createdAt
  }
}
```

### Subscribe to User Activity

```graphql
subscription {
  userActivity
}
```

### Subscribe to Performance Metrics

```graphql
subscription {
  performanceMetricsStream(intervalSeconds: 60) {
    queryCount
    averageResponseTime
    cacheHitRate
    errorRate
    timestamp
  }
}
```

## Utility Queries

### Check Rate Limit Status

```graphql
query {
  rateLimitStatus {
    currentCount
    limit
    remaining
    resetTime
    windowSeconds
  }
}
```

### Get Performance Metrics

```graphql
query {
  performanceMetrics {
    queryCount
    averageResponseTime
    cacheHitRate
    errorRate
    timestamp
  }
}
```

## Error Handling

### Handling Authentication Errors

```graphql
query {
  me {
    id
    email
  }
}
```

Response for unauthenticated request:
```json
{
  "errors": [
    {
      "message": "Authentication required",
      "extensions": {
        "code": "UNAUTHENTICATED"
      }
    }
  ]
}
```

### Handling Validation Errors

```graphql
mutation {
  rateItem(input: {
    itemId: "invalid-uuid"
    rating: 6.0
  }) {
    id
  }
}
```

Response:
```json
{
  "errors": [
    {
      "message": "Invalid UUID format",
      "path": ["rateItem"],
      "extensions": {
        "code": "BAD_USER_INPUT"
      }
    }
  ]
}
```

### Handling Rate Limit Errors

```json
{
  "errors": [
    {
      "message": "Rate limit exceeded",
      "extensions": {
        "code": "RATE_LIMITED",
        "retryAfter": 3600
      }
    }
  ]
}
```

## Best Practices

1. **Use Variables**: Always use GraphQL variables for dynamic values instead of string interpolation.

2. **Request Only What You Need**: Only request the fields you actually need to minimize response size.

3. **Handle Errors Gracefully**: Always check for errors in the response and handle them appropriately.

4. **Use Fragments**: For repeated field selections, use GraphQL fragments to keep queries DRY.

5. **Implement Proper Authentication**: Always include the JWT token in the Authorization header for protected operations.

6. **Monitor Rate Limits**: Check your rate limit status periodically to avoid hitting limits.

7. **Cache Responses**: Implement client-side caching for frequently accessed data that doesn't change often.