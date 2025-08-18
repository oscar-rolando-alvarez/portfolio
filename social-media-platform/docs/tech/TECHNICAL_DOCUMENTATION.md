# SocialConnect - Technical Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Database Design](#database-design)
5. [API Documentation](#api-documentation)
6. [Authentication & Security](#authentication--security)
7. [Real-time Features](#real-time-features)
8. [State Management](#state-management)
9. [Component Architecture](#component-architecture)
10. [Development Setup](#development-setup)
11. [Deployment](#deployment)
12. [Performance Optimizations](#performance-optimizations)
13. [Testing Strategy](#testing-strategy)
14. [Code Organization](#code-organization)
15. [Dependencies](#dependencies)

## System Overview

SocialConnect is a modern, full-stack social media platform built with Vue 3, Nuxt 3, and TypeScript. The application features real-time messaging, story sharing, content feeds, and comprehensive social interactions. It's designed as a Progressive Web App (PWA) with offline capabilities and mobile-first responsive design.

### Key Features

- **User Management**: Registration, authentication, profiles, privacy settings
- **Content Creation**: Posts with text, images, videos, stories
- **Social Interactions**: Likes, comments, shares, follows, bookmarks
- **Real-time Messaging**: Direct messages, group chats, typing indicators
- **Content Moderation**: AI-powered filtering, reporting system
- **Analytics**: User interaction tracking, engagement metrics
- **PWA Features**: Offline support, push notifications, app installation

## Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client (PWA)  │    │  Nuxt 3 Server  │    │   PostgreSQL    │
│                 │    │                 │    │    Database     │
│  - Vue 3        │◄──►│  - API Routes   │◄──►│                 │
│  - Pinia Store  │    │  - SSR/SSG      │    │  - Prisma ORM   │
│  - Tailwind CSS │    │  - WebSocket    │    │  - Redis Cache  │
│  - TypeScript   │    │  - Auth Mgmt    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ External APIs   │
                    │                 │
                    │ - Cloudinary    │
                    │ - Firebase      │
                    │ - Push Services │
                    └─────────────────┘
```

### Application Layers

1. **Presentation Layer** (Vue 3 Components)
   - Page components (`pages/`)
   - Reusable UI components (`components/`)
   - Layout components (`layouts/`)

2. **State Management Layer** (Pinia Stores)
   - Auth store (`stores/auth.ts`)
   - Posts store (`stores/posts.ts`)
   - Messaging store (`stores/messaging.ts`)
   - Stories store (`stores/stories.ts`)

3. **API Layer** (Nuxt 3 Server Routes)
   - Authentication endpoints (`server/api/auth/`)
   - Posts management (`server/api/posts/`)
   - Messaging API (`server/api/messages/`)
   - User management (`server/api/users/`)

4. **Data Layer** (Database & ORM)
   - PostgreSQL database
   - Prisma ORM for data modeling
   - Redis for caching and sessions

5. **External Services**
   - Cloudinary for media storage
   - Firebase for push notifications
   - Socket.IO for real-time communication

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vue 3** | ^3.3.0 | Progressive JavaScript framework with Composition API |
| **Nuxt 3** | ^3.8.0 | Full-stack framework with SSR/SSG capabilities |
| **TypeScript** | ^5.2.0 | Type-safe development and better IDE support |
| **Tailwind CSS** | ^3.3.0 | Utility-first CSS framework for styling |
| **Pinia** | ^2.1.7 | State management library for Vue |
| **VueUse** | ^10.5.0 | Collection of essential Vue composition utilities |
| **Headless UI** | ^1.7.16 | Unstyled, accessible UI components |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | >=18.0.0 | JavaScript runtime environment |
| **Nuxt 3 API Routes** | ^3.8.0 | Server-side API endpoints |
| **Prisma** | ^5.5.0 | Modern database toolkit and ORM |
| **PostgreSQL** | 15+ | Primary relational database |
| **Socket.IO** | ^4.7.2 | Real-time bidirectional communication |
| **JWT** | ^9.0.2 | JSON Web Tokens for authentication |
| **bcryptjs** | ^2.4.3 | Password hashing library |
| **Zod** | ^3.22.0 | Schema validation library |

### Development & Build Tools

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vite** | (via Nuxt) | Fast build tool and dev server |
| **ESLint** | ^8.50.0 | Code linting and formatting |
| **Vitest** | ^0.34.0 | Testing framework |
| **Docker** | Latest | Containerization platform |
| **Prisma Studio** | (via Prisma) | Database management GUI |

### Infrastructure & Services

| Service | Purpose |
|---------|---------|
| **Docker Compose** | Local development environment |
| **PostgreSQL** | Primary database |
| **Redis** | Caching and session storage |
| **Cloudinary** | Media storage and optimization |
| **Firebase** | Push notifications |
| **Nginx** | Reverse proxy and load balancing |

## Database Design

### Schema Overview

The database uses PostgreSQL with Prisma ORM for type-safe database operations. The schema is designed for scalability and includes comprehensive audit trails and soft deletes where appropriate.

### Core Models

#### User Model
```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  username    String   @unique
  displayName String?
  bio         String?
  avatar      String?
  coverImage  String?
  verified    Boolean  @default(false)
  private     Boolean  @default(false)
  password    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  posts       Post[]
  stories     Story[]
  comments    Comment[]
  likes       Like[]
  bookmarks   Bookmark[]
  following   Follow[] @relation("UserFollowing")
  followers   Follow[] @relation("UserFollowers")
  // ... additional relations
}
```

#### Post Model
```prisma
model Post {
  id          String         @id @default(cuid())
  content     String?
  images      String[]
  videos      String[]
  type        PostType       @default(TEXT)
  visibility  PostVisibility @default(PUBLIC)
  authorId    String
  author      User           @relation(fields: [authorId], references: [id])
  views       Int            @default(0)
  flagged     Boolean        @default(false)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  
  // Engagement relations
  likes       Like[]
  comments    Comment[]
  bookmarks   Bookmark[]
  shares      Share[]
}
```

### Relationship Design

#### Social Connections
- **Follow**: Many-to-many self-referencing relationship for user connections
- **Block**: User blocking mechanism with cascade delete
- **Privacy Settings**: Granular privacy controls per user

#### Content Engagement
- **Like**: Polymorphic likes for posts and comments
- **Comment**: Nested commenting with parent-child relationships
- **Bookmark**: User content bookmarking
- **Share**: Social sharing tracking

#### Messaging System
- **Conversation**: Group and direct messaging support
- **ConversationParticipant**: User participation in conversations with roles
- **Message**: Rich messaging with media support and read receipts

#### Content Moderation
- **Report**: User reporting system with status tracking
- **AnalyticsEvent**: User behavior tracking for recommendations

### Indexes and Performance

```sql
-- High-performance indexes for common queries
CREATE INDEX idx_posts_author_created ON posts(authorId, createdAt DESC);
CREATE INDEX idx_posts_visibility_flagged ON posts(visibility, flagged);
CREATE INDEX idx_follows_follower_following ON follows(followerId, followingId);
CREATE INDEX idx_messages_conversation_created ON messages(conversationId, createdAt DESC);
CREATE INDEX idx_likes_user_post ON likes(userId, postId);
CREATE INDEX idx_comments_post_created ON comments(postId, createdAt DESC);
```

## API Documentation

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "securePassword",
  "displayName": "Display Name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "username": "username",
      "displayName": "Display Name",
      "verified": false,
      "private": false,
      "createdAt": "2023-10-01T00:00:00.000Z"
    },
    "accessToken": "jwt_token"
  }
}
```

#### POST `/api/auth/login`
Authenticate user and get access token.

**Request Body:**
```json
{
  "identifier": "email_or_username",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { /* user object */ },
    "accessToken": "jwt_token"
  }
}
```

#### POST `/api/auth/refresh`
Refresh access token using refresh token.

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "accessToken": "new_jwt_token"
  }
}
```

#### GET `/api/auth/me`
Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* user object */ }
  }
}
```

### Posts Endpoints

#### GET `/api/posts/feed`
Get personalized user feed with recommendation algorithm.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10, max: 50)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "post_id",
        "content": "Post content",
        "images": ["image_url"],
        "videos": ["video_url"],
        "type": "TEXT",
        "visibility": "PUBLIC",
        "author": {
          "id": "author_id",
          "username": "author_username",
          "displayName": "Author Name",
          "avatar": "avatar_url",
          "verified": true
        },
        "likesCount": 15,
        "commentsCount": 3,
        "sharesCount": 2,
        "views": 142,
        "isLiked": true,
        "isBookmarked": false,
        "createdAt": "2023-10-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "pages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### POST `/api/posts`
Create a new post.

**Request Body:**
```json
{
  "content": "Post content",
  "images": ["image_url1", "image_url2"],
  "videos": ["video_url"],
  "type": "IMAGE",
  "visibility": "PUBLIC"
}
```

#### POST `/api/posts/:id/like`
Like or unlike a post.

**Response:**
```json
{
  "success": true,
  "data": {
    "isLiked": true,
    "likesCount": 16
  }
}
```

### Messaging Endpoints

#### GET `/api/messages/conversations`
Get user's conversations.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "conversation_id",
      "type": "DIRECT",
      "name": null,
      "participants": [
        {
          "user": {
            "id": "user_id",
            "username": "username",
            "displayName": "Display Name",
            "avatar": "avatar_url"
          },
          "role": "MEMBER",
          "lastReadAt": "2023-10-01T00:00:00.000Z"
        }
      ],
      "lastMessage": {
        "id": "message_id",
        "content": "Hello!",
        "type": "TEXT",
        "createdAt": "2023-10-01T00:00:00.000Z"
      },
      "unreadCount": 2,
      "lastMessageAt": "2023-10-01T00:00:00.000Z"
    }
  ]
}
```

#### POST `/api/messages/conversations`
Create a new conversation.

**Request Body:**
```json
{
  "type": "DIRECT",
  "participantIds": ["user_id_1", "user_id_2"]
}
```

#### POST `/api/messages/conversations/:id/messages`
Send a message in a conversation.

**Request Body:**
```json
{
  "content": "Message content",
  "type": "TEXT",
  "replyToId": "optional_message_id"
}
```

### Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

Common status codes:
- `400`: Bad Request - Invalid input data
- `401`: Unauthorized - Invalid or missing authentication
- `403`: Forbidden - Insufficient permissions
- `404`: Not Found - Resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server-side error

## Authentication & Security

### JWT-Based Authentication

The application uses a dual-token authentication system:

1. **Access Token**: Short-lived (15 minutes) JWT for API access
2. **Refresh Token**: Long-lived (7 days) token stored as httpOnly cookie

#### Token Structure

**Access Token Payload:**
```json
{
  "userId": "user_id",
  "email": "user@example.com",
  "username": "username",
  "iat": 1696118400,
  "exp": 1696119300,
  "iss": "socialconnect",
  "aud": "socialconnect-users"
}
```

#### Authentication Flow

```mermaid
sequenceDiagram
    Client->>Server: POST /api/auth/login
    Server->>Database: Verify credentials
    Database-->>Server: User data
    Server->>Server: Generate tokens
    Server-->>Client: Access token + Set httpOnly cookie
    Client->>Server: API request with Bearer token
    Server->>Server: Verify access token
    Server-->>Client: Protected resource
    Note over Client,Server: Token expires
    Client->>Server: POST /api/auth/refresh
    Server->>Server: Verify refresh token
    Server-->>Client: New access token
```

### Security Measures

#### Password Security
- **bcrypt** hashing with salt rounds of 12
- Password complexity requirements:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number

#### Input Validation
- **Zod** schema validation for all API endpoints
- SQL injection prevention through Prisma ORM
- XSS protection with content sanitization
- CSRF protection via SameSite cookies

#### Rate Limiting
```typescript
// Example rate limiting configuration
const rateLimits = {
  auth: { max: 5, window: '15m' },      // 5 attempts per 15 minutes
  posts: { max: 100, window: '1h' },    // 100 posts per hour
  messages: { max: 1000, window: '1h' } // 1000 messages per hour
}
```

#### Session Management
- Secure session tracking with unique tokens
- Automatic cleanup of expired sessions
- Device and location tracking for security audits
- Concurrent session limits

### Privacy Controls

#### User Privacy Settings
```typescript
interface PrivacySettings {
  profileVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE'
  postsVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE'
  storiesVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE'
  messagingVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE'
  onlineStatusVisible: boolean
  readReceiptsEnabled: boolean
  dataProcessingConsent: boolean
  analyticsConsent: boolean
  marketingConsent: boolean
}
```

#### Content Visibility Matrix

| User Relationship | Public Posts | Friends Posts | Private Posts |
|-------------------|--------------|---------------|---------------|
| **Public User**   | ✅ Visible    | ❌ Hidden      | ❌ Hidden      |
| **Following**     | ✅ Visible    | ✅ Visible     | ❌ Hidden      |
| **Friend**        | ✅ Visible    | ✅ Visible     | ✅ Visible     |
| **Blocked**       | ❌ Hidden     | ❌ Hidden      | ❌ Hidden      |

## Real-time Features

### WebSocket Implementation

The application uses Socket.IO for real-time communication with authentication middleware and room-based message routing.

#### Connection Flow

```typescript
// Client connection
const socket = io({
  auth: {
    token: accessToken
  }
})

// Server authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    const user = await authService.getUserFromToken(token)
    
    if (!user) {
      return next(new Error('Invalid token'))
    }
    
    socket.data = { userId: user.id, username: user.username }
    next()
  } catch (error) {
    next(new Error('Authentication failed'))
  }
})
```

#### Real-time Events

| Event | Description | Data Structure |
|-------|-------------|----------------|
| **message** | New message in conversation | `{ id, content, sender, conversationId, createdAt }` |
| **typing** | User typing indicator | `{ conversationId, userId, username, isTyping }` |
| **message-read** | Message read receipt | `{ messageId, readAt, readBy }` |
| **notification** | New notification | `{ type, title, content, data, createdAt }` |
| **user-status** | User online/offline status | `{ userId, status: 'online' \| 'offline' }` |

#### Room Management

```typescript
// User rooms
socket.join(`user:${userId}`)              // Personal notifications
socket.join(`conversation:${conversationId}`) // Conversation messages

// Automatic room joining for user conversations
async function joinUserConversations(socket, userId) {
  const conversations = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true }
  })
  
  conversations.forEach(conv => {
    socket.join(`conversation:${conv.conversationId}`)
  })
}
```

### Typing Indicators

```typescript
// Client-side typing detection
let typingTimer
const TYPING_TIMEOUT = 3000

const handleTyping = () => {
  socket.emit('typing-start', { conversationId })
  
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    socket.emit('typing-stop', { conversationId })
  }, TYPING_TIMEOUT)
}
```

### Push Notifications

#### Web Push Implementation

```typescript
// Service worker registration
if ('serviceWorker' in navigator && 'PushManager' in window) {
  const registration = await navigator.serviceWorker.register('/sw.js')
  
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey
  })
  
  // Send subscription to server
  await $fetch('/api/notifications/subscribe', {
    method: 'POST',
    body: { subscription }
  })
}
```

#### Firebase Integration

```typescript
// Firebase configuration
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken } from 'firebase/messaging'

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

// Get FCM token
const token = await getToken(messaging, {
  vapidKey: vapidPublicKey
})
```

## State Management

### Pinia Store Architecture

The application uses Pinia for centralized state management with TypeScript support and composition API.

#### Auth Store Structure

```typescript
interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null
  }),
  
  getters: {
    currentUser: (state) => state.user,
    isLoggedIn: (state) => state.isAuthenticated && !!state.user,
    authToken: (state) => state.accessToken
  },
  
  actions: {
    async login(credentials: LoginForm) { /* ... */ },
    async logout() { /* ... */ },
    async refreshToken() { /* ... */ }
  }
})
```

#### Posts Store Structure

```typescript
interface PostsState {
  feedPosts: Post[]
  userPosts: Post[]
  currentPost: Post | null
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  page: number
  error: string | null
}

export const usePostsStore = defineStore('posts', {
  state: (): PostsState => ({ /* ... */ }),
  
  actions: {
    async fetchFeed(refresh = false) {
      if (refresh) {
        this.feedPosts = []
        this.page = 1
        this.hasMore = true
      }
      
      const { data } = await $fetch('/api/posts/feed', {
        query: { page: this.page, limit: 10 }
      })
      
      this.feedPosts.push(...data.data)
      this.hasMore = data.pagination.hasNext
      this.page++
    },
    
    async likePost(postId: string) {
      const post = this.feedPosts.find(p => p.id === postId)
      if (!post) return
      
      // Optimistic update
      post.isLiked = !post.isLiked
      post.likesCount += post.isLiked ? 1 : -1
      
      try {
        await $fetch(`/api/posts/${postId}/like`, { method: 'POST' })
      } catch (error) {
        // Revert on error
        post.isLiked = !post.isLiked
        post.likesCount += post.isLiked ? 1 : -1
        throw error
      }
    }
  }
})
```

### State Persistence

```typescript
// Automatic state persistence for auth
export const useAuthStore = defineStore('auth', {
  // ... store definition
  
  persist: {
    key: 'socialconnect-auth',
    storage: persistedState.localStorage,
    pick: ['user', 'accessToken', 'isAuthenticated']
  }
})
```

## Component Architecture

### Component Hierarchy

```
App.vue
├── layouts/default.vue
│   ├── HeaderDesktop.vue
│   ├── HeaderMobile.vue
│   ├── Sidebar.vue
│   ├── BottomNavigation.vue
│   └── RightSidebar.vue
├── pages/
│   ├── index.vue (Home Feed)
│   ├── auth/login.vue
│   ├── profile/[username].vue
│   ├── messages/index.vue
│   └── settings/index.vue
└── components/
    ├── ui/ (Reusable UI components)
    ├── forms/ (Form components)
    ├── post/ (Post-related components)
    ├── messaging/ (Chat components)
    └── story/ (Story components)
```

### Component Design Patterns

#### Composition API Pattern

```vue
<template>
  <div class="post-card">
    <PostHeader :author="post.author" :created-at="post.createdAt" />
    <PostContent :content="post.content" :media="post.media" />
    <PostActions 
      :post="post" 
      @like="handleLike"
      @comment="handleComment"
      @share="handleShare"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'

interface Props {
  post: Post
}

interface Emits {
  (e: 'like', postId: string): void
  (e: 'comment', postId: string): void
  (e: 'share', postId: string, platform: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const postsStore = usePostsStore()

const handleLike = async () => {
  try {
    await postsStore.likePost(props.post.id)
    emit('like', props.post.id)
  } catch (error) {
    console.error('Like failed:', error)
  }
}
</script>
```

#### Composable Pattern

```typescript
// composables/useInfiniteScroll.ts
export function useInfiniteScroll(
  target: Ref<HTMLElement | null>,
  callback: () => void | Promise<void>,
  options: IntersectionObserverInit = {}
) {
  const observer = ref<IntersectionObserver | null>(null)
  
  const stop = () => {
    if (observer.value) {
      observer.value.disconnect()
      observer.value = null
    }
  }
  
  const start = () => {
    if (!target.value) return
    
    observer.value = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          callback()
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px',
        ...options
      }
    )
    
    observer.value.observe(target.value)
  }
  
  onMounted(start)
  onUnmounted(stop)
  
  return { start, stop }
}
```

### Responsive Design System

#### Breakpoint System

```css
/* Tailwind CSS breakpoints */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large desktop */
```

#### Component Responsiveness

```vue
<template>
  <div class="container">
    <!-- Mobile layout -->
    <div class="block md:hidden">
      <MobileHeader />
      <MobileNavigation />
    </div>
    
    <!-- Desktop layout -->
    <div class="hidden md:flex">
      <Sidebar class="w-64 lg:w-80" />
      <main class="flex-1 max-w-2xl mx-auto">
        <slot />
      </main>
      <aside class="w-80 hidden lg:block">
        <RightSidebar />
      </aside>
    </div>
  </div>
</template>
```

## Development Setup

### Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **PostgreSQL**: Version 13 or higher
- **Redis**: Version 6 or higher (optional, for caching)
- **Git**: Latest version

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd social-media-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   ```
   
   Configure the following environment variables:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/socialconnect"
   
   # Authentication
   JWT_SECRET="your-super-secret-jwt-key"
   
   # Redis (optional)
   REDIS_URL="redis://localhost:6379"
   
   # Cloudinary (for media upload)
   CLOUDINARY_CLOUD_NAME="your-cloud-name"
   CLOUDINARY_API_KEY="your-api-key"
   CLOUDINARY_API_SECRET="your-api-secret"
   
   # Firebase (for push notifications)
   FIREBASE_PROJECT_ID="your-project-id"
   FIREBASE_PRIVATE_KEY="your-private-key"
   FIREBASE_CLIENT_EMAIL="your-client-email"
   VAPID_PUBLIC_KEY="your-vapid-public-key"
   VAPID_PRIVATE_KEY="your-vapid-private-key"
   ```

4. **Database setup**
   ```bash
   # Create database
   createdb socialconnect
   
   # Generate Prisma client
   npx prisma generate
   
   # Run migrations
   npx prisma db push
   
   # Optional: Seed with sample data
   npx prisma db seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:3000`

### Docker Development Setup

1. **Using Docker Compose**
   ```bash
   # Copy environment file
   cp .env.example .env
   
   # Start all services
   docker-compose up -d
   
   # Run database migrations
   docker-compose exec app npx prisma db push
   ```

2. **Services available**
   - **App**: http://localhost:3000
   - **Database**: localhost:5432
   - **Redis**: localhost:6379

### Development Scripts

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "preview": "nuxt preview",
    "generate": "nuxt generate",
    "start": "node .output/server/index.mjs",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "type-check": "vue-tsc --noEmit"
  }
}
```

### Database Management

```bash
# Prisma Studio (Database GUI)
npx prisma studio

# Reset database
npx prisma db reset

# Deploy schema changes
npx prisma db push

# Generate migrations
npx prisma migrate dev

# Format schema
npx prisma format
```

## Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Docker Production Deployment

```dockerfile
# Multi-stage Dockerfile for optimization
FROM node:18-alpine AS base
FROM base AS deps
# Install dependencies
FROM base AS builder
# Build application
FROM base AS runner
# Run production server
```

#### Docker Build Commands

```bash
# Build production image
docker build -t socialconnect:latest .

# Run container
docker run -p 3000:3000 --env-file .env socialconnect:latest
```

### Platform Deployment Options

#### Vercel (Recommended)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "nuxt.config.ts",
      "use": "@nuxtjs/vercel-builder"
    }
  ],
  "env": {
    "DATABASE_URL": "@database-url",
    "JWT_SECRET": "@jwt-secret"
  }
}
```

#### Railway

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health"
  }
}
```

#### DigitalOcean App Platform

```yaml
name: socialconnect
services:
- name: web
  source_dir: /
  github:
    repo: your-username/social-media-platform
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  envs:
  - key: DATABASE_URL
    value: ${db.DATABASE_URL}
  - key: JWT_SECRET
    value: ${JWT_SECRET}
```

### Environment Configuration

#### Production Environment Variables

```env
# Application
NODE_ENV=production
APP_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Security
JWT_SECRET=your-production-jwt-secret

# External Services
CLOUDINARY_CLOUD_NAME=production-cloud
FIREBASE_PROJECT_ID=production-project

# Monitoring
SENTRY_DSN=your-sentry-dsn
```

### Health Checks

```typescript
// server/api/health.get.ts
export default defineEventHandler(async (event) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`
    
    // Check Redis connection (if used)
    if (redis) {
      await redis.ping()
    }
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected'
      }
    }
  } catch (error) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable'
    })
  }
})
```

## Performance Optimizations

### Frontend Optimizations

#### Code Splitting and Lazy Loading

```typescript
// Lazy load components
const PostModal = defineAsyncComponent(() => import('~/components/PostModal.vue'))
const StoryViewer = defineAsyncComponent(() => import('~/components/StoryViewer.vue'))

// Route-based code splitting (automatic with Nuxt 3)
const ProfilePage = defineAsyncComponent(() => import('~/pages/profile/[username].vue'))
```

#### Image Optimization

```vue
<template>
  <!-- Nuxt Image for automatic optimization -->
  <NuxtImg
    :src="post.images[0]"
    :alt="post.content"
    width="600"
    height="400"
    format="webp"
    quality="80"
    loading="lazy"
    class="rounded-lg object-cover"
  />
</template>
```

#### Virtual Scrolling for Large Lists

```typescript
// composables/useVirtualScroll.ts
export function useVirtualScroll<T>(
  items: Ref<T[]>,
  itemHeight: number,
  containerHeight: number
) {
  const scrollTop = ref(0)
  
  const visibleItems = computed(() => {
    const start = Math.floor(scrollTop.value / itemHeight)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const end = start + visibleCount + 2 // Buffer items
    
    return {
      start,
      end,
      items: items.value.slice(start, end),
      offsetY: start * itemHeight,
      totalHeight: items.value.length * itemHeight
    }
  })
  
  return { visibleItems, scrollTop }
}
```

#### Bundle Analysis

```bash
# Analyze bundle size
npm run build -- --analyze

# Bundle visualization
npx nuxi analyze
```

### Backend Optimizations

#### Database Query Optimization

```typescript
// Efficient feed query with includes
const feedPosts = await prisma.post.findMany({
  where: {
    AND: [
      { authorId: { in: followingIds } },
      { flagged: false },
      { visibility: { in: ['PUBLIC', 'FRIENDS'] } }
    ]
  },
  include: {
    author: {
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        verified: true
      }
    },
    _count: {
      select: {
        likes: true,
        comments: true,
        shares: true
      }
    },
    likes: {
      where: { userId },
      take: 1
    }
  },
  orderBy: [
    { createdAt: 'desc' }
  ],
  take: limit,
  skip: (page - 1) * limit
})
```

#### Caching Strategy

```typescript
// Redis caching for expensive operations
export class CacheService {
  private redis = new Redis(process.env.REDIS_URL)
  
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }
  
  async set(key: string, value: any, ttl = 3600): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value))
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }
  
  async getUserFeed(userId: string): Promise<Post[] | null> {
    return this.get(`feed:${userId}`)
  }
  
  async setUserFeed(userId: string, posts: Post[]): Promise<void> {
    await this.set(`feed:${userId}`, posts, 300) // 5 minutes
  }
}
```

#### Connection Pooling

```typescript
// Prisma connection pooling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=10&pool_timeout=20`
    }
  }
})
```

### PWA Optimizations

#### Service Worker Caching

```javascript
// public/sw.js
const CACHE_NAME = 'socialconnect-v1'
const urlsToCache = [
  '/',
  '/offline',
  '/manifest.json',
  // Static assets
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request)
      })
  )
})
```

#### Background Sync

```javascript
// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncData())
  }
})

async function syncData() {
  const pendingPosts = await getPendingPosts()
  
  for (const post of pendingPosts) {
    try {
      await fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(post)
      })
      await removePendingPost(post.id)
    } catch (error) {
      console.error('Sync failed:', error)
    }
  }
}
```

## Testing Strategy

### Unit Testing with Vitest

```typescript
// tests/stores/auth.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '~/stores/auth'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should login successfully', async () => {
    const authStore = useAuthStore()
    
    // Mock API response
    global.$fetch = vi.fn().mockResolvedValue({
      success: true,
      data: {
        user: { id: '1', username: 'test' },
        accessToken: 'token'
      }
    })

    await authStore.login({
      identifier: 'test@example.com',
      password: 'password'
    })

    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.user?.username).toBe('test')
  })

  it('should handle login error', async () => {
    const authStore = useAuthStore()
    
    global.$fetch = vi.fn().mockRejectedValue({
      data: { message: 'Invalid credentials' }
    })

    await expect(authStore.login({
      identifier: 'invalid',
      password: 'wrong'
    })).rejects.toThrow()

    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.error).toBe('Invalid credentials')
  })
})
```

### Component Testing

```typescript
// tests/components/PostCard.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PostCard from '~/components/post/PostCard.vue'

describe('PostCard', () => {
  const mockPost = {
    id: '1',
    content: 'Test post',
    author: {
      id: '1',
      username: 'testuser',
      displayName: 'Test User',
      verified: false
    },
    likesCount: 5,
    commentsCount: 2,
    sharesCount: 1,
    isLiked: false,
    createdAt: '2023-10-01T00:00:00.000Z'
  }

  it('renders post content correctly', () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    expect(wrapper.text()).toContain('Test post')
    expect(wrapper.text()).toContain('Test User')
    expect(wrapper.text()).toContain('5 likes')
  })

  it('emits like event when like button clicked', async () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    await wrapper.find('[data-testid="like-button"]').trigger('click')
    
    expect(wrapper.emitted('like')).toBeTruthy()
    expect(wrapper.emitted('like')?.[0]).toEqual(['1'])
  })
})
```

### API Testing

```typescript
// tests/api/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, $fetch } from '@nuxt/test-utils'

describe('/api/auth', async () => {
  await setupTest({
    server: true
  })

  it('should register new user', async () => {
    const response = await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password123!',
        displayName: 'Test User'
      }
    })

    expect(response.success).toBe(true)
    expect(response.data.user.email).toBe('test@example.com')
    expect(response.data.accessToken).toBeDefined()
  })

  it('should reject invalid registration', async () => {
    await expect($fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'invalid-email',
        username: 'tu',
        password: '123'
      }
    })).rejects.toThrow()
  })
})
```

### E2E Testing with Playwright

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should login and navigate to feed', async ({ page }) => {
    await page.goto('/')
    
    // Should redirect to login
    await expect(page).toHaveURL('/auth/login')
    
    // Fill login form
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password')
    await page.click('[data-testid="login-button"]')
    
    // Should redirect to feed
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="feed"]')).toBeVisible()
  })

  test('should create and display new post', async ({ page }) => {
    // Assume user is logged in
    await page.goto('/')
    
    // Create new post
    await page.fill('[data-testid="post-input"]', 'This is a test post')
    await page.click('[data-testid="post-submit"]')
    
    // Verify post appears in feed
    await expect(page.locator('[data-testid="post"]').first())
      .toContainText('This is a test post')
  })
})
```

### Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        'nuxt.config.ts'
      ]
    },
    setupFiles: ['tests/setup.ts']
  },
  resolve: {
    alias: {
      '~': '.',
      '@': '.'
    }
  }
})
```

## Code Organization

### Directory Structure

```
social-media-platform/
├── assets/                 # Static assets
│   ├── css/               # Global styles
│   ├── icons/             # Icon assets
│   └── images/            # Image assets
├── components/            # Vue components
│   ├── ui/               # Reusable UI components
│   │   ├── Button.vue
│   │   ├── Modal.vue
│   │   ├── Input.vue
│   │   └── LoadingSpinner.vue
│   ├── forms/            # Form components
│   │   ├── LoginForm.vue
│   │   ├── RegisterForm.vue
│   │   └── CreatePostForm.vue
│   ├── post/             # Post-related components
│   │   ├── PostCard.vue
│   │   ├── PostMedia.vue
│   │   ├── PostComments.vue
│   │   └── PostActions.vue
│   ├── messaging/        # Chat components
│   │   ├── ConversationList.vue
│   │   ├── MessageList.vue
│   │   ├── MessageInput.vue
│   │   └── TypingIndicator.vue
│   └── story/            # Story components
│       ├── StoryViewer.vue
│       ├── StoryCarousel.vue
│       └── StoryCreator.vue
├── composables/          # Vue composables
│   ├── useAuth.ts
│   ├── useInfiniteScroll.ts
│   ├── useWebSocket.ts
│   └── useFileUpload.ts
├── layouts/              # Page layouts
│   ├── default.vue
│   ├── auth.vue
│   └── minimal.vue
├── middleware/           # Route middleware
│   ├── auth.ts
│   └── guest.ts
├── pages/                # File-based routing
│   ├── index.vue         # Home feed
│   ├── auth/
│   │   ├── login.vue
│   │   └── register.vue
│   ├── profile/
│   │   └── [username].vue
│   ├── messages/
│   │   ├── index.vue
│   │   └── [id].vue
│   └── settings/
│       ├── index.vue
│       ├── privacy.vue
│       └── notifications.vue
├── plugins/              # Nuxt plugins
│   ├── pinia.client.ts
│   └── socket.client.ts
├── prisma/               # Database schema
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── public/               # Static files
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── favicon.ico
│   └── sw.js
├── server/               # Server-side code
│   ├── api/             # API routes
│   │   ├── auth/
│   │   │   ├── login.post.ts
│   │   │   ├── register.post.ts
│   │   │   ├── refresh.post.ts
│   │   │   └── me.get.ts
│   │   ├── posts/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   ├── feed.get.ts
│   │   │   └── [id]/
│   │   │       └── like.post.ts
│   │   ├── messages/
│   │   │   └── conversations/
│   │   └── users/
│   ├── middleware/      # Server middleware
│   │   └── auth.ts
│   ├── plugins/         # Server plugins
│   │   └── websocket.ts
│   └── utils/           # Server utilities
│       ├── auth.ts
│       ├── prisma.ts
│       └── validation.ts
├── stores/               # Pinia stores
│   ├── auth.ts
│   ├── posts.ts
│   ├── messaging.ts
│   └── stories.ts
├── types/                # TypeScript types
│   └── index.ts
├── utils/                # Client utilities
│   ├── format.ts
│   ├── upload.ts
│   └── constants.ts
└── tests/                # Test files
    ├── api/
    ├── components/
    ├── e2e/
    └── setup.ts
```

### Naming Conventions

#### Files and Directories
- **Components**: PascalCase (`PostCard.vue`)
- **Pages**: kebab-case (`user-profile.vue`)
- **Composables**: camelCase with `use` prefix (`useAuth.ts`)
- **Stores**: camelCase (`posts.ts`)
- **API Routes**: HTTP method suffix (`.get.ts`, `.post.ts`)

#### Variables and Functions
- **Variables**: camelCase (`userId`, `postData`)
- **Constants**: SCREAMING_SNAKE_CASE (`API_BASE_URL`)
- **Functions**: camelCase (`handleSubmit`, `fetchUserData`)
- **TypeScript Interfaces**: PascalCase (`User`, `PostForm`)

#### CSS Classes
- **Tailwind**: Utility classes (`bg-blue-500`, `text-center`)
- **Custom**: kebab-case (`post-card`, `message-input`)
- **BEM**: Component__Element--Modifier (`sidebar__item--active`)

### Import Organization

```typescript
// 1. Vue/Nuxt imports
import { ref, computed, onMounted } from 'vue'
import { defineStore } from 'pinia'

// 2. External library imports
import { z } from 'zod'
import bcrypt from 'bcryptjs'

// 3. Internal imports (types first)
import type { User, Post, ApiResponse } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { formatDate } from '~/utils/format'

// 4. Component imports
import PostCard from '~/components/post/PostCard.vue'
import LoadingSpinner from '~/components/ui/LoadingSpinner.vue'
```

### Code Style Guide

#### TypeScript Interfaces

```typescript
// Use descriptive interface names
interface UserProfileData {
  id: string
  username: string
  displayName: string | null
  bio: string | null
  avatar: string | null
  followersCount: number
  followingCount: number
  postsCount: number
}

// Use utility types for variations
type CreateUserData = Pick<UserProfileData, 'username' | 'displayName' | 'bio'>
type UpdateUserData = Partial<CreateUserData>
```

#### Error Handling

```typescript
// Consistent error handling pattern
export async function createPost(postData: CreatePostData): Promise<Post> {
  try {
    const response = await $fetch<ApiResponse<Post>>('/api/posts', {
      method: 'POST',
      body: postData
    })
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to create post')
    }
    
    return response.data
  } catch (error) {
    console.error('Create post error:', error)
    throw error instanceof Error ? error : new Error('Unknown error')
  }
}
```

#### Async/Await Best Practices

```typescript
// Good: Proper error handling and cleanup
async function fetchUserFeed(userId: string) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  
  try {
    const posts = await postsService.getFeed(userId)
    return posts
  } catch (err) {
    error.value = err.message
    throw err
  } finally {
    loading.value = false
  }
}

// Good: Parallel async operations
async function initializePage() {
  const [user, posts, conversations] = await Promise.all([
    authService.getCurrentUser(),
    postsService.getFeed(),
    messagingService.getConversations()
  ])
  
  return { user, posts, conversations }
}
```

## Dependencies

### Production Dependencies

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| **@headlessui/vue** | ^1.7.16 | Accessible UI components | MIT |
| **@heroicons/vue** | ^2.0.18 | Icon library | MIT |
| **@nuxt/image** | ^1.0.0 | Image optimization | MIT |
| **@nuxtjs/google-fonts** | ^3.0.2 | Google Fonts integration | MIT |
| **@pinia/nuxt** | ^0.5.1 | State management | MIT |
| **@prisma/client** | ^5.5.0 | Database client | Apache-2.0 |
| **@sidebase/nuxt-auth** | ^0.6.0 | Authentication module | MIT |
| **@tailwindcss/forms** | ^0.5.6 | Form styling | MIT |
| **@tailwindcss/typography** | ^0.5.10 | Typography plugin | MIT |
| **@vite-pwa/nuxt** | ^0.3.0 | PWA functionality | MIT |
| **@vueuse/core** | ^10.5.0 | Vue composition utilities | MIT |
| **@vueuse/nuxt** | ^10.5.0 | Nuxt integration | MIT |
| **bcryptjs** | ^2.4.3 | Password hashing | MIT |
| **compression** | ^1.7.4 | Response compression | MIT |
| **drizzle-orm** | ^0.29.0 | Alternative ORM | Apache-2.0 |
| **drizzle-kit** | ^0.20.0 | Migration tool | Apache-2.0 |
| **firebase** | ^10.5.0 | Push notifications | Apache-2.0 |
| **jsonwebtoken** | ^9.0.2 | JWT tokens | MIT |
| **marked** | ^9.1.0 | Markdown parser | MIT |
| **multer** | ^1.4.5-lts.1 | File upload handling | MIT |
| **nitro** | ^2.7.0 | Server engine | MIT |
| **node-cron** | ^3.0.2 | Scheduled tasks | ISC |
| **nuxt** | ^3.8.0 | Framework | MIT |
| **pinia** | ^2.1.7 | State management | MIT |
| **postgres** | ^3.4.0 | PostgreSQL client | Unlicense |
| **prisma** | ^5.5.0 | Database toolkit | Apache-2.0 |
| **sharp** | ^0.32.6 | Image processing | Apache-2.0 |
| **socket.io** | ^4.7.2 | WebSocket server | MIT |
| **socket.io-client** | ^4.7.2 | WebSocket client | MIT |
| **tailwindcss** | ^3.3.0 | CSS framework | MIT |
| **vue** | ^3.3.0 | JavaScript framework | MIT |
| **vue-router** | ^4.2.0 | Router | MIT |
| **ws** | ^8.14.0 | WebSocket library | MIT |
| **zod** | ^3.22.0 | Schema validation | MIT |

### Development Dependencies

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| **@nuxt/devtools** | latest | Development tools | MIT |
| **@nuxt/eslint-config** | ^0.2.0 | ESLint configuration | MIT |
| **@nuxt/test-utils** | ^3.8.0 | Testing utilities | MIT |
| **@types/bcryptjs** | ^2.4.6 | TypeScript definitions | MIT |
| **@types/compression** | ^1.7.5 | TypeScript definitions | MIT |
| **@types/jsonwebtoken** | ^9.0.5 | TypeScript definitions | MIT |
| **@types/multer** | ^1.4.11 | TypeScript definitions | MIT |
| **@types/node** | ^20.8.0 | Node.js type definitions | MIT |
| **@types/ws** | ^8.5.10 | WebSocket type definitions | MIT |
| **@vitest/ui** | ^0.34.0 | Test UI | MIT |
| **@vue/test-utils** | ^2.4.0 | Vue testing utilities | MIT |
| **eslint** | ^8.50.0 | Code linting | MIT |
| **happy-dom** | ^12.0.0 | DOM environment for testing | MIT |
| **sass** | ^1.69.0 | CSS preprocessor | MIT |
| **typescript** | ^5.2.0 | TypeScript compiler | Apache-2.0 |
| **vitest** | ^0.34.0 | Testing framework | MIT |
| **vue-tsc** | ^1.8.0 | Vue TypeScript compiler | MIT |

### License Compliance

All dependencies are using permissive licenses (MIT, Apache-2.0, ISC, Unlicense) that allow for commercial use, modification, and distribution. No GPL or other copyleft licenses are used.

### Security Considerations

- All dependencies are regularly updated to patch security vulnerabilities
- Automated dependency scanning with tools like `npm audit`
- Pinned versions to ensure reproducible builds
- Dev dependencies are excluded from production builds

### Bundle Size Impact

| Category | Size (gzipped) | Impact |
|----------|----------------|--------|
| **Vue/Nuxt Core** | ~150KB | Essential framework |
| **UI Libraries** | ~80KB | Headless UI, Heroicons |
| **State Management** | ~15KB | Pinia |
| **Utilities** | ~50KB | VueUse, date formatting |
| **Styling** | ~10KB | Tailwind CSS runtime |
| **Authentication** | ~30KB | JWT, bcrypt (server) |
| **WebSocket** | ~25KB | Socket.IO client |
| **Total (approx.)** | ~360KB | Competitive for features |

---

*This technical documentation is automatically maintained and updated with each release. For the latest version and additional resources, visit the project repository.*