# GraphQL Schema Documentation

This document describes the GraphQL schema for the Recommendation API.

## Table of Contents

- [Authentication](#authentication)
- [Queries](#queries)
- [Mutations](#mutations)
- [Subscriptions](#subscriptions)
- [Types](#types)
- [Input Types](#input-types)
- [Enums](#enums)

## Authentication

Most operations require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Queries

### `me`

Get the current authenticated user's information.

**Returns:** `User | null`

```graphql
query {
  me {
    id
    email
    username
    tenant {
      name
      domain
    }
    preferences
    profileData
  }
}
```

### `user(user_id: UUID!)`

Get a specific user by ID (must belong to same tenant).

**Parameters:**
- `user_id`: UUID of the user

**Returns:** `User | null`

```graphql
query GetUser($userId: UUID!) {
  user(userId: $userId) {
    id
    email
    username
    isActive
    isVerified
  }
}
```

### `users(limit: Int = 10, offset: Int = 0)`

Get paginated list of users in the current tenant.

**Parameters:**
- `limit`: Maximum number of users to return (default: 10)
- `offset`: Number of users to skip (default: 0)

**Returns:** `[User!]!`

```graphql
query GetUsers($limit: Int, $offset: Int) {
  users(limit: $limit, offset: $offset) {
    id
    email
    username
    createdAt
  }
}
```

### `item(item_id: UUID!)`

Get a specific item by ID.

**Parameters:**
- `item_id`: UUID of the item

**Returns:** `Item | null`

```graphql
query GetItem($itemId: UUID!) {
  item(itemId: $itemId) {
    id
    title
    description
    category
    tags
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

### `items(category: String, search: String, limit: Int = 10, offset: Int = 0)`

Get paginated list of items with optional filtering.

**Parameters:**
- `category`: Filter by category (optional)
- `search`: Search in title and description (optional)
- `limit`: Maximum number of items to return (default: 10)
- `offset`: Number of items to skip (default: 0)

**Returns:** `[Item!]!`

```graphql
query GetItems($category: String, $search: String, $limit: Int, $offset: Int) {
  items(category: $category, search: $search, limit: $limit, offset: $offset) {
    id
    title
    description
    category
    popularityScore
    averageRating
  }
}
```

### `recommendations(options: RecommendationOptions)`

Get personalized recommendations for the current user.

**Parameters:**
- `options`: Recommendation options (optional)

**Returns:** `RecommendationResult!`

```graphql
query GetRecommendations($options: RecommendationOptions) {
  recommendations(options: $options) {
    items {
      item {
        id
        title
        category
        description
      }
      score
      reason
      metadata
    }
    algorithm
    generatedAt
    responseTimeMs
    totalCount
    explanation {
      method
      explanation
      metadata
    }
  }
}
```

### `similarItems(item_id: UUID!, top_k: Int = 10)`

Get items similar to the specified item.

**Parameters:**
- `item_id`: UUID of the reference item
- `top_k`: Number of similar items to return (default: 10)

**Returns:** `[RecommendationItem!]!`

```graphql
query GetSimilarItems($itemId: UUID!, $topK: Int) {
  similarItems(itemId: $itemId, topK: $topK) {
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

### `rateLimitStatus`

Get current rate limit status for the authenticated user.

**Returns:** `RateLimitStatus!`

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

### `performanceMetrics`

Get current performance metrics (requires admin privileges).

**Returns:** `PerformanceMetrics!`

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

## Mutations

### `login(input: LoginInput!)`

Authenticate a user and receive JWT tokens.

**Parameters:**
- `input`: Login credentials

**Returns:** `AuthPayload!`

```graphql
mutation Login($input: LoginInput!) {
  login(input: $input) {
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

### `register(input: RegisterInput!)`

Register a new user account.

**Parameters:**
- `input`: Registration information

**Returns:** `AuthPayload!`

```graphql
mutation Register($input: RegisterInput!) {
  register(input: $input) {
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

### `recordInteraction(input: InteractionInput!)`

Record a user interaction with an item.

**Parameters:**
- `input`: Interaction details

**Returns:** `Interaction!`

```graphql
mutation RecordInteraction($input: InteractionInput!) {
  recordInteraction(input: $input) {
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

### `rateItem(input: RatingInput!)`

Rate an item.

**Parameters:**
- `input`: Rating details

**Returns:** `Rating!`

```graphql
mutation RateItem($input: RatingInput!) {
  rateItem(input: $input) {
    id
    rating
    review
    item {
      id
      title
    }
    createdAt
  }
}
```

### `createItem(input: ItemInput!)`

Create a new item.

**Parameters:**
- `input`: Item details

**Returns:** `Item!`

```graphql
mutation CreateItem($input: ItemInput!) {
  createItem(input: $input) {
    id
    title
    description
    category
    tags
    metadata
    createdAt
  }
}
```

## Subscriptions

### `recommendationUpdates(algorithm: String = "hybrid")`

Subscribe to real-time recommendation updates.

**Parameters:**
- `algorithm`: Recommendation algorithm (default: "hybrid")

**Returns:** `[RecommendationItem!]!`

```graphql
subscription RecommendationUpdates($algorithm: String) {
  recommendationUpdates(algorithm: $algorithm) {
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

### `itemInteractions(item_id: UUID!)`

Subscribe to real-time interactions for a specific item.

**Parameters:**
- `item_id`: UUID of the item to monitor

**Returns:** `Interaction!`

```graphql
subscription ItemInteractions($itemId: UUID!) {
  itemInteractions(itemId: $itemId) {
    id
    interactionType
    user {
      username
    }
    createdAt
  }
}
```

### `userActivity`

Subscribe to current user's activity feed.

**Returns:** `JSON!`

```graphql
subscription {
  userActivity
}
```

### `performanceMetricsStream(interval_seconds: Int = 30)`

Subscribe to real-time performance metrics.

**Parameters:**
- `interval_seconds`: Update interval in seconds (default: 30)

**Returns:** `PerformanceMetrics!`

```graphql
subscription PerformanceStream($interval: Int) {
  performanceMetricsStream(intervalSeconds: $interval) {
    queryCount
    averageResponseTime
    cacheHitRate
    errorRate
    timestamp
  }
}
```

## Types

### `User`

Represents a user in the system.

```graphql
type User {
  id: UUID!
  tenantId: UUID!
  email: String!
  username: String!
  isActive: Boolean!
  isVerified: Boolean!
  preferences: JSON!
  profileData: JSON!
  createdAt: DateTime!
  updatedAt: DateTime
  
  # Relationships
  tenant: Tenant
  interactions(interactionType: String): [Interaction!]!
  ratings: [Rating!]!
}
```

### `Item`

Represents an item that can be recommended.

```graphql
type Item {
  id: UUID!
  tenantId: UUID!
  title: String!
  description: String
  category: String
  tags: JSON!
  metadata: JSON!
  contentFeatures: JSON!
  isActive: Boolean!
  popularityScore: Float!
  createdAt: DateTime!
  updatedAt: DateTime
  
  # Relationships
  tenant: Tenant
  interactions(interactionType: String): [Interaction!]!
  ratings: [Rating!]!
  averageRating: Float
  similarItems(topK: Int = 10): [SimilarItem!]!
}
```

### `Interaction`

Represents a user interaction with an item.

```graphql
type Interaction {
  id: UUID!
  tenantId: UUID!
  userId: UUID!
  itemId: UUID!
  interactionType: String!
  interactionValue: Float!
  sessionId: String
  context: JSON!
  createdAt: DateTime!
  
  # Relationships
  user: User
  item: Item
}
```

### `Rating`

Represents a user rating of an item.

```graphql
type Rating {
  id: UUID!
  tenantId: UUID!
  userId: UUID!
  itemId: UUID!
  rating: Float!
  review: String
  createdAt: DateTime!
  
  # Relationships
  user: User
  item: Item
}
```

### `Tenant`

Represents a tenant in the multi-tenant system.

```graphql
type Tenant {
  id: UUID!
  name: String!
  domain: String!
  isActive: Boolean!
  settings: JSON!
  subscriptionTier: String!
  createdAt: DateTime!
  updatedAt: DateTime
}
```

### `RecommendationResult`

Contains recommendation results and metadata.

```graphql
type RecommendationResult {
  items: [RecommendationItem!]!
  algorithm: String!
  generatedAt: DateTime!
  responseTimeMs: Float!
  totalCount: Int!
  explanation: RecommendationExplanation
}
```

### `RecommendationItem`

A single recommendation item with score.

```graphql
type RecommendationItem {
  item: Item!
  score: Float!
  reason: String
  metadata: JSON
}
```

### `SimilarItem`

An item similar to another item.

```graphql
type SimilarItem {
  item: Item!
  similarityScore: Float!
}
```

### `AuthPayload`

Authentication response payload.

```graphql
type AuthPayload {
  accessToken: String!
  refreshToken: String!
  user: User!
  expiresIn: Int!
}
```

### `RateLimitStatus`

Current rate limit status.

```graphql
type RateLimitStatus {
  currentCount: Int!
  limit: Int!
  remaining: Int!
  resetTime: DateTime!
  windowSeconds: Int!
}
```

### `PerformanceMetrics`

System performance metrics.

```graphql
type PerformanceMetrics {
  queryCount: Int!
  averageResponseTime: Float!
  cacheHitRate: Float!
  errorRate: Float!
  timestamp: DateTime!
}
```

### `RecommendationExplanation`

Explanation of why items were recommended.

```graphql
type RecommendationExplanation {
  method: String!
  explanation: String!
  metadata: JSON!
}
```

## Input Types

### `LoginInput`

Input for user login.

```graphql
input LoginInput {
  email: String!
  password: String!
}
```

### `RegisterInput`

Input for user registration.

```graphql
input RegisterInput {
  email: String!
  username: String!
  password: String!
  tenantDomain: String!
}
```

### `InteractionInput`

Input for recording user interactions.

```graphql
input InteractionInput {
  itemId: UUID!
  interactionType: String!
  interactionValue: Float = 1.0
  sessionId: String
  context: JSON
}
```

### `RatingInput`

Input for rating items.

```graphql
input RatingInput {
  itemId: UUID!
  rating: Float!
  review: String
}
```

### `ItemInput`

Input for creating items.

```graphql
input ItemInput {
  title: String!
  description: String
  category: String
  tags: JSON
  metadata: JSON
  contentFeatures: JSON
}
```

### `RecommendationOptions`

Options for recommendation queries.

```graphql
input RecommendationOptions {
  algorithm: String = "hybrid"
  numRecommendations: Int = 10
  diversify: Boolean = true
  explain: Boolean = false
  filters: RecommendationFilter
}
```

### `RecommendationFilter`

Filters for recommendations.

```graphql
input RecommendationFilter {
  categories: [String!]
  excludeCategories: [String!]
  minScore: Float = 0.0
  maxAgeDays: Int
}
```

## Enums

### `InteractionType`

Types of user interactions.

```graphql
enum InteractionType {
  VIEW
  CLICK
  PURCHASE
  LIKE
  SHARE
  BOOKMARK
}
```

### `RecommendationAlgorithm`

Available recommendation algorithms.

```graphql
enum RecommendationAlgorithm {
  COLLABORATIVE
  CONTENT_BASED
  MATRIX_FACTORIZATION
  HYBRID
  ENSEMBLE
}
```

### `SubscriptionTier`

Available subscription tiers.

```graphql
enum SubscriptionTier {
  BASIC
  PREMIUM
  ENTERPRISE
}
```

## Scalars

### `UUID`

UUID scalar type for unique identifiers.

### `DateTime`

ISO 8601 datetime string.

### `JSON`

Arbitrary JSON data.