# SocialConnect - Documentación Técnica

## Índice

1. [Resumen del Sistema](#resumen-del-sistema)
2. [Arquitectura](#arquitectura)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Diseño de Base de Datos](#diseño-de-base-de-datos)
5. [Documentación de API](#documentación-de-api)
6. [Autenticación y Seguridad](#autenticación-y-seguridad)
7. [Características en Tiempo Real](#características-en-tiempo-real)
8. [Gestión de Estado](#gestión-de-estado)
9. [Arquitectura de Componentes](#arquitectura-de-componentes)
10. [Configuración de Desarrollo](#configuración-de-desarrollo)
11. [Despliegue](#despliegue)
12. [Optimizaciones de Rendimiento](#optimizaciones-de-rendimiento)
13. [Estrategia de Testing](#estrategia-de-testing)
14. [Organización del Código](#organización-del-código)
15. [Dependencias](#dependencias)

## Resumen del Sistema

SocialConnect es una plataforma de redes sociales moderna y full-stack construida con Vue 3, Nuxt 3 y TypeScript. La aplicación incluye mensajería en tiempo real, compartir historias, feeds de contenido e interacciones sociales completas. Está diseñada como una Aplicación Web Progresiva (PWA) con capacidades offline y diseño responsivo mobile-first.

### Características Principales

- **Gestión de Usuarios**: Registro, autenticación, perfiles, configuraciones de privacidad
- **Creación de Contenido**: Posts con texto, imágenes, videos, historias
- **Interacciones Sociales**: Likes, comentarios, compartir, seguir, marcadores
- **Mensajería en Tiempo Real**: Mensajes directos, chats grupales, indicadores de escritura
- **Moderación de Contenido**: Filtrado con IA, sistema de reportes
- **Analíticas**: Seguimiento de interacciones, métricas de engagement
- **Características PWA**: Soporte offline, notificaciones push, instalación de app

## Arquitectura

### Arquitectura de Alto Nivel

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Cliente (PWA) │    │ Servidor Nuxt 3 │    │   PostgreSQL    │
│                 │    │                 │    │  Base de Datos  │
│  - Vue 3        │◄──►│  - Rutas API    │◄──►│                 │
│  - Pinia Store  │    │  - SSR/SSG      │    │  - Prisma ORM   │
│  - Tailwind CSS │    │  - WebSocket    │    │  - Cache Redis  │
│  - TypeScript   │    │  - Gest. Auth   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   APIs Externas │
                    │                 │
                    │ - Cloudinary    │
                    │ - Firebase      │
                    │ - Servicios Push│
                    └─────────────────┘
```

### Capas de la Aplicación

1. **Capa de Presentación** (Componentes Vue 3)
   - Componentes de página (`pages/`)
   - Componentes UI reutilizables (`components/`)
   - Componentes de layout (`layouts/`)

2. **Capa de Gestión de Estado** (Stores Pinia)
   - Store de autenticación (`stores/auth.ts`)
   - Store de posts (`stores/posts.ts`)
   - Store de mensajería (`stores/messaging.ts`)
   - Store de historias (`stores/stories.ts`)

3. **Capa de API** (Rutas del Servidor Nuxt 3)
   - Endpoints de autenticación (`server/api/auth/`)
   - Gestión de posts (`server/api/posts/`)
   - API de mensajería (`server/api/messages/`)
   - Gestión de usuarios (`server/api/users/`)

4. **Capa de Datos** (Base de Datos y ORM)
   - Base de datos PostgreSQL
   - Prisma ORM para modelado de datos
   - Redis para caché y sesiones

5. **Servicios Externos**
   - Cloudinary para almacenamiento de medios
   - Firebase para notificaciones push
   - Socket.IO para comunicación en tiempo real

## Stack Tecnológico

### Frontend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Vue 3** | ^3.3.0 | Framework JavaScript progresivo con Composition API |
| **Nuxt 3** | ^3.8.0 | Framework full-stack con capacidades SSR/SSG |
| **TypeScript** | ^5.2.0 | Desarrollo type-safe y mejor soporte IDE |
| **Tailwind CSS** | ^3.3.0 | Framework CSS utility-first para estilos |
| **Pinia** | ^2.1.7 | Librería de gestión de estado para Vue |
| **VueUse** | ^10.5.0 | Colección de utilidades esenciales de Vue composition |
| **Headless UI** | ^1.7.16 | Componentes UI sin estilos y accesibles |

### Backend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Node.js** | >=18.0.0 | Entorno de ejecución JavaScript |
| **Rutas API Nuxt 3** | ^3.8.0 | Endpoints API del lado del servidor |
| **Prisma** | ^5.5.0 | Toolkit moderno de base de datos y ORM |
| **PostgreSQL** | 15+ | Base de datos relacional principal |
| **Socket.IO** | ^4.7.2 | Comunicación bidireccional en tiempo real |
| **JWT** | ^9.0.2 | JSON Web Tokens para autenticación |
| **bcryptjs** | ^2.4.3 | Librería de hashing de contraseñas |
| **Zod** | ^3.22.0 | Librería de validación de esquemas |

### Herramientas de Desarrollo y Build

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Vite** | (vía Nuxt) | Herramienta de build rápida y servidor dev |
| **ESLint** | ^8.50.0 | Linting y formateo de código |
| **Vitest** | ^0.34.0 | Framework de testing |
| **Docker** | Última | Plataforma de contenedorización |
| **Prisma Studio** | (vía Prisma) | GUI de gestión de base de datos |

### Infraestructura y Servicios

| Servicio | Propósito |
|----------|-----------|
| **Docker Compose** | Entorno de desarrollo local |
| **PostgreSQL** | Base de datos principal |
| **Redis** | Caché y almacenamiento de sesiones |
| **Cloudinary** | Almacenamiento y optimización de medios |
| **Firebase** | Notificaciones push |
| **Nginx** | Proxy reverso y balanceador de carga |

## Diseño de Base de Datos

### Resumen del Esquema

La base de datos utiliza PostgreSQL con Prisma ORM para operaciones type-safe. El esquema está diseñado para escalabilidad e incluye auditorías completas y soft deletes cuando es apropiado.

### Modelos Principales

#### Modelo Usuario
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
  
  // Relaciones
  posts       Post[]
  stories     Story[]
  comments    Comment[]
  likes       Like[]
  bookmarks   Bookmark[]
  following   Follow[] @relation("UserFollowing")
  followers   Follow[] @relation("UserFollowers")
  // ... relaciones adicionales
}
```

#### Modelo Post
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
  
  // Relaciones de engagement
  likes       Like[]
  comments    Comment[]
  bookmarks   Bookmark[]
  shares      Share[]
}
```

### Diseño de Relaciones

#### Conexiones Sociales
- **Follow**: Relación many-to-many auto-referencial para conexiones de usuarios
- **Block**: Mecanismo de bloqueo de usuarios con cascade delete
- **Privacy Settings**: Controles de privacidad granulares por usuario

#### Engagement de Contenido
- **Like**: Likes polimórficos para posts y comentarios
- **Comment**: Comentarios anidados con relaciones padre-hijo
- **Bookmark**: Marcadores de contenido del usuario
- **Share**: Seguimiento de compartir en redes sociales

#### Sistema de Mensajería
- **Conversation**: Soporte para mensajería grupal y directa
- **ConversationParticipant**: Participación de usuarios en conversaciones con roles
- **Message**: Mensajería rica con soporte de medios y confirmaciones de lectura

#### Moderación de Contenido
- **Report**: Sistema de reportes de usuarios con seguimiento de estado
- **AnalyticsEvent**: Seguimiento de comportamiento de usuarios para recomendaciones

### Índices y Rendimiento

```sql
-- Índices de alto rendimiento para consultas comunes
CREATE INDEX idx_posts_author_created ON posts(authorId, createdAt DESC);
CREATE INDEX idx_posts_visibility_flagged ON posts(visibility, flagged);
CREATE INDEX idx_follows_follower_following ON follows(followerId, followingId);
CREATE INDEX idx_messages_conversation_created ON messages(conversationId, createdAt DESC);
CREATE INDEX idx_likes_user_post ON likes(userId, postId);
CREATE INDEX idx_comments_post_created ON comments(postId, createdAt DESC);
```

## Documentación de API

### Endpoints de Autenticación

#### POST `/api/auth/register`
Registra una nueva cuenta de usuario.

**Cuerpo de la Solicitud:**
```json
{
  "email": "usuario@ejemplo.com",
  "username": "nombreusuario",
  "password": "contraseñaSegura",
  "displayName": "Nombre a Mostrar"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Registro exitoso",
  "data": {
    "user": {
      "id": "user_id",
      "email": "usuario@ejemplo.com",
      "username": "nombreusuario",
      "displayName": "Nombre a Mostrar",
      "verified": false,
      "private": false,
      "createdAt": "2023-10-01T00:00:00.000Z"
    },
    "accessToken": "jwt_token"
  }
}
```

#### POST `/api/auth/login`
Autentica usuario y obtiene token de acceso.

**Cuerpo de la Solicitud:**
```json
{
  "identifier": "email_o_nombreusuario",
  "password": "contraseña"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "user": { /* objeto usuario */ },
    "accessToken": "jwt_token"
  }
}
```

#### POST `/api/auth/refresh`
Refresca el token de acceso usando el refresh token.

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "user": { /* objeto usuario */ },
    "accessToken": "nuevo_jwt_token"
  }
}
```

#### GET `/api/auth/me`
Obtiene información del usuario autenticado actual.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "user": { /* objeto usuario */ }
  }
}
```

### Endpoints de Posts

#### GET `/api/posts/feed`
Obtiene feed personalizado de usuario con algoritmo de recomendación.

**Parámetros de Consulta:**
- `page` (número): Número de página (por defecto: 1)
- `limit` (número): Elementos por página (por defecto: 10, máx: 50)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "post_id",
        "content": "Contenido del post",
        "images": ["url_imagen"],
        "videos": ["url_video"],
        "type": "TEXT",
        "visibility": "PUBLIC",
        "author": {
          "id": "author_id",
          "username": "autor_username",
          "displayName": "Nombre Autor",
          "avatar": "url_avatar",
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
Crea un nuevo post.

**Cuerpo de la Solicitud:**
```json
{
  "content": "Contenido del post",
  "images": ["url_imagen1", "url_imagen2"],
  "videos": ["url_video"],
  "type": "IMAGE",
  "visibility": "PUBLIC"
}
```

#### POST `/api/posts/:id/like`
Da me gusta o quita me gusta a un post.

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "isLiked": true,
    "likesCount": 16
  }
}
```

### Endpoints de Mensajería

#### GET `/api/messages/conversations`
Obtiene las conversaciones del usuario.

**Respuesta:**
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
            "username": "nombreusuario",
            "displayName": "Nombre a Mostrar",
            "avatar": "url_avatar"
          },
          "role": "MEMBER",
          "lastReadAt": "2023-10-01T00:00:00.000Z"
        }
      ],
      "lastMessage": {
        "id": "message_id",
        "content": "¡Hola!",
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
Crea una nueva conversación.

**Cuerpo de la Solicitud:**
```json
{
  "type": "DIRECT",
  "participantIds": ["user_id_1", "user_id_2"]
}
```

#### POST `/api/messages/conversations/:id/messages`
Envía un mensaje en una conversación.

**Cuerpo de la Solicitud:**
```json
{
  "content": "Contenido del mensaje",
  "type": "TEXT",
  "replyToId": "message_id_opcional"
}
```

### Respuestas de Error

Todos los endpoints devuelven respuestas de error estandarizadas:

```json
{
  "success": false,
  "error": "Mensaje de error",
  "statusCode": 400
}
```

Códigos de estado comunes:
- `400`: Bad Request - Datos de entrada inválidos
- `401`: Unauthorized - Autenticación inválida o faltante
- `403`: Forbidden - Permisos insuficientes
- `404`: Not Found - Recurso no encontrado
- `429`: Too Many Requests - Límite de tasa excedido
- `500`: Internal Server Error - Error del lado del servidor

## Autenticación y Seguridad

### Autenticación Basada en JWT

La aplicación utiliza un sistema de autenticación de doble token:

1. **Token de Acceso**: JWT de corta duración (15 minutos) para acceso a API
2. **Refresh Token**: Token de larga duración (7 días) almacenado como cookie httpOnly

#### Estructura del Token

**Payload del Token de Acceso:**
```json
{
  "userId": "user_id",
  "email": "usuario@ejemplo.com",
  "username": "nombreusuario",
  "iat": 1696118400,
  "exp": 1696119300,
  "iss": "socialconnect",
  "aud": "socialconnect-users"
}
```

#### Flujo de Autenticación

```mermaid
sequenceDiagram
    Cliente->>Servidor: POST /api/auth/login
    Servidor->>BaseDatos: Verificar credenciales
    BaseDatos-->>Servidor: Datos del usuario
    Servidor->>Servidor: Generar tokens
    Servidor-->>Cliente: Token de acceso + Cookie httpOnly
    Cliente->>Servidor: Solicitud API con Bearer token
    Servidor->>Servidor: Verificar token de acceso
    Servidor-->>Cliente: Recurso protegido
    Note over Cliente,Servidor: Token expira
    Cliente->>Servidor: POST /api/auth/refresh
    Servidor->>Servidor: Verificar refresh token
    Servidor-->>Cliente: Nuevo token de acceso
```

### Medidas de Seguridad

#### Seguridad de Contraseñas
- Hashing con **bcrypt** con salt rounds de 12
- Requisitos de complejidad de contraseña:
  - Mínimo 8 caracteres
  - Al menos 1 letra mayúscula
  - Al menos 1 letra minúscula
  - Al menos 1 número

#### Validación de Entrada
- Validación de esquemas con **Zod** para todos los endpoints API
- Prevención de inyección SQL a través de Prisma ORM
- Protección XSS con sanitización de contenido
- Protección CSRF vía cookies SameSite

#### Limitación de Tasa
```typescript
// Ejemplo de configuración de limitación de tasa
const rateLimits = {
  auth: { max: 5, window: '15m' },      // 5 intentos por 15 minutos
  posts: { max: 100, window: '1h' },    // 100 posts por hora
  messages: { max: 1000, window: '1h' } // 1000 mensajes por hora
}
```

#### Gestión de Sesiones
- Seguimiento seguro de sesiones con tokens únicos
- Limpieza automática de sesiones expiradas
- Seguimiento de dispositivo y ubicación para auditorías de seguridad
- Límites de sesiones concurrentes

### Controles de Privacidad

#### Configuraciones de Privacidad del Usuario
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

#### Matriz de Visibilidad de Contenido

| Relación Usuario | Posts Públicos | Posts Amigos | Posts Privados |
|------------------|----------------|--------------|----------------|
| **Usuario Público** | ✅ Visible | ❌ Oculto | ❌ Oculto |
| **Siguiendo** | ✅ Visible | ✅ Visible | ❌ Oculto |
| **Amigo** | ✅ Visible | ✅ Visible | ✅ Visible |
| **Bloqueado** | ❌ Oculto | ❌ Oculto | ❌ Oculto |

## Características en Tiempo Real

### Implementación WebSocket

La aplicación utiliza Socket.IO para comunicación en tiempo real con middleware de autenticación y enrutamiento de mensajes basado en salas.

#### Flujo de Conexión

```typescript
// Conexión del cliente
const socket = io({
  auth: {
    token: accessToken
  }
})

// Middleware de autenticación del servidor
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    const user = await authService.getUserFromToken(token)
    
    if (!user) {
      return next(new Error('Token inválido'))
    }
    
    socket.data = { userId: user.id, username: user.username }
    next()
  } catch (error) {
    next(new Error('Autenticación fallida'))
  }
})
```

#### Eventos en Tiempo Real

| Evento | Descripción | Estructura de Datos |
|--------|-------------|---------------------|
| **message** | Nuevo mensaje en conversación | `{ id, content, sender, conversationId, createdAt }` |
| **typing** | Indicador de usuario escribiendo | `{ conversationId, userId, username, isTyping }` |
| **message-read** | Confirmación de lectura de mensaje | `{ messageId, readAt, readBy }` |
| **notification** | Nueva notificación | `{ type, title, content, data, createdAt }` |
| **user-status** | Estado online/offline del usuario | `{ userId, status: 'online' \| 'offline' }` |

#### Gestión de Salas

```typescript
// Salas de usuario
socket.join(`user:${userId}`)              // Notificaciones personales
socket.join(`conversation:${conversationId}`) // Mensajes de conversación

// Unión automática a salas para conversaciones del usuario
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

### Indicadores de Escritura

```typescript
// Detección de escritura del lado del cliente
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

### Notificaciones Push

#### Implementación Web Push

```typescript
// Registro del service worker
if ('serviceWorker' in navigator && 'PushManager' in window) {
  const registration = await navigator.serviceWorker.register('/sw.js')
  
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey
  })
  
  // Enviar suscripción al servidor
  await $fetch('/api/notifications/subscribe', {
    method: 'POST',
    body: { subscription }
  })
}
```

#### Integración con Firebase

```typescript
// Configuración de Firebase
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken } from 'firebase/messaging'

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

// Obtener token FCM
const token = await getToken(messaging, {
  vapidKey: vapidPublicKey
})
```

## Gestión de Estado

### Arquitectura de Store Pinia

La aplicación utiliza Pinia para gestión de estado centralizada con soporte de TypeScript y composition API.

#### Estructura del Store de Auth

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

#### Estructura del Store de Posts

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
      
      // Actualización optimista
      post.isLiked = !post.isLiked
      post.likesCount += post.isLiked ? 1 : -1
      
      try {
        await $fetch(`/api/posts/${postId}/like`, { method: 'POST' })
      } catch (error) {
        // Revertir en caso de error
        post.isLiked = !post.isLiked
        post.likesCount += post.isLiked ? 1 : -1
        throw error
      }
    }
  }
})
```

### Persistencia de Estado

```typescript
// Persistencia automática de estado para auth
export const useAuthStore = defineStore('auth', {
  // ... definición del store
  
  persist: {
    key: 'socialconnect-auth',
    storage: persistedState.localStorage,
    pick: ['user', 'accessToken', 'isAuthenticated']
  }
})
```

## Arquitectura de Componentes

### Jerarquía de Componentes

```
App.vue
├── layouts/default.vue
│   ├── HeaderDesktop.vue
│   ├── HeaderMobile.vue
│   ├── Sidebar.vue
│   ├── BottomNavigation.vue
│   └── RightSidebar.vue
├── pages/
│   ├── index.vue (Feed Principal)
│   ├── auth/login.vue
│   ├── profile/[username].vue
│   ├── messages/index.vue
│   └── settings/index.vue
└── components/
    ├── ui/ (Componentes UI reutilizables)
    ├── forms/ (Componentes de formularios)
    ├── post/ (Componentes relacionados con posts)
    ├── messaging/ (Componentes de chat)
    └── story/ (Componentes de historias)
```

### Patrones de Diseño de Componentes

#### Patrón Composition API

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
    console.error('Like falló:', error)
  }
}
</script>
```

#### Patrón Composable

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

### Sistema de Diseño Responsivo

#### Sistema de Breakpoints

```css
/* Breakpoints de Tailwind CSS */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Desktop grande */
2xl: 1536px /* Desktop extra grande */
```

#### Responsividad de Componentes

```vue
<template>
  <div class="container">
    <!-- Layout móvil -->
    <div class="block md:hidden">
      <MobileHeader />
      <MobileNavigation />
    </div>
    
    <!-- Layout desktop -->
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

## Configuración de Desarrollo

### Prerequisitos

- **Node.js**: Versión 18.x o superior
- **npm**: Versión 9.x o superior
- **PostgreSQL**: Versión 13 o superior
- **Redis**: Versión 6 o superior (opcional, para caché)
- **Git**: Versión más reciente

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd social-media-platform
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configuración del entorno**
   ```bash
   cp .env.example .env
   ```
   
   Configurar las siguientes variables de entorno:
   ```env
   # Base de datos
   DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/socialconnect"
   
   # Autenticación
   JWT_SECRET="tu-clave-jwt-super-secreta"
   
   # Redis (opcional)
   REDIS_URL="redis://localhost:6379"
   
   # Cloudinary (para subida de medios)
   CLOUDINARY_CLOUD_NAME="tu-nombre-cloud"
   CLOUDINARY_API_KEY="tu-api-key"
   CLOUDINARY_API_SECRET="tu-api-secret"
   
   # Firebase (para notificaciones push)
   FIREBASE_PROJECT_ID="tu-project-id"
   FIREBASE_PRIVATE_KEY="tu-private-key"
   FIREBASE_CLIENT_EMAIL="tu-client-email"
   VAPID_PUBLIC_KEY="tu-vapid-public-key"
   VAPID_PRIVATE_KEY="tu-vapid-private-key"
   ```

4. **Configuración de la base de datos**
   ```bash
   # Crear base de datos
   createdb socialconnect
   
   # Generar cliente de Prisma
   npx prisma generate
   
   # Ejecutar migraciones
   npx prisma db push
   
   # Opcional: Poblar con datos de muestra
   npx prisma db seed
   ```

5. **Iniciar servidor de desarrollo**
   ```bash
   npm run dev
   ```

   La aplicación estará disponible en `http://localhost:3000`

### Configuración de Desarrollo con Docker

1. **Usando Docker Compose**
   ```bash
   # Copiar archivo de entorno
   cp .env.example .env
   
   # Iniciar todos los servicios
   docker-compose up -d
   
   # Ejecutar migraciones de base de datos
   docker-compose exec app npx prisma db push
   ```

2. **Servicios disponibles**
   - **App**: http://localhost:3000
   - **Base de datos**: localhost:5432
   - **Redis**: localhost:6379

### Scripts de Desarrollo

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

### Gestión de Base de Datos

```bash
# Prisma Studio (GUI de base de datos)
npx prisma studio

# Resetear base de datos
npx prisma db reset

# Desplegar cambios de esquema
npx prisma db push

# Generar migraciones
npx prisma migrate dev

# Formatear esquema
npx prisma format
```

## Despliegue

### Build de Producción

```bash
# Build para producción
npm run build

# Iniciar servidor de producción
npm start
```

### Despliegue de Producción con Docker

```dockerfile
# Dockerfile multi-etapa para optimización
FROM node:18-alpine AS base
FROM base AS deps
# Instalar dependencias
FROM base AS builder
# Construir aplicación
FROM base AS runner
# Ejecutar servidor de producción
```

#### Comandos de Build Docker

```bash
# Construir imagen de producción
docker build -t socialconnect:latest .

# Ejecutar contenedor
docker run -p 3000:3000 --env-file .env socialconnect:latest
```

### Opciones de Despliegue en Plataformas

#### Vercel (Recomendado)

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
    repo: tu-usuario/social-media-platform
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

### Configuración del Entorno

#### Variables de Entorno de Producción

```env
# Aplicación
NODE_ENV=production
APP_URL=https://tu-dominio.com

# Base de datos
DATABASE_URL=postgresql://usuario:pass@host:5432/db

# Seguridad
JWT_SECRET=tu-jwt-secret-de-produccion

# Servicios externos
CLOUDINARY_CLOUD_NAME=cloud-produccion
FIREBASE_PROJECT_ID=proyecto-produccion

# Monitoreo
SENTRY_DSN=tu-sentry-dsn
```

### Health Checks

```typescript
// server/api/health.get.ts
export default defineEventHandler(async (event) => {
  try {
    // Verificar conexión a base de datos
    await prisma.$queryRaw`SELECT 1`
    
    // Verificar conexión a Redis (si se usa)
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
      statusMessage: 'Servicio No Disponible'
    })
  }
})
```

## Optimizaciones de Rendimiento

### Optimizaciones Frontend

#### Code Splitting y Lazy Loading

```typescript
// Lazy load de componentes
const PostModal = defineAsyncComponent(() => import('~/components/PostModal.vue'))
const StoryViewer = defineAsyncComponent(() => import('~/components/StoryViewer.vue'))

// Code splitting basado en rutas (automático con Nuxt 3)
const ProfilePage = defineAsyncComponent(() => import('~/pages/profile/[username].vue'))
```

#### Optimización de Imágenes

```vue
<template>
  <!-- Nuxt Image para optimización automática -->
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

#### Scroll Virtual para Listas Grandes

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

#### Análisis de Bundle

```bash
# Analizar tamaño del bundle
npm run build -- --analyze

# Visualización del bundle
npx nuxi analyze
```

### Optimizaciones Backend

#### Optimización de Consultas de Base de Datos

```typescript
// Consulta eficiente del feed con includes
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

#### Estrategia de Caché

```typescript
// Caché Redis para operaciones costosas
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
      console.error('Error de caché set:', error)
    }
  }
  
  async getUserFeed(userId: string): Promise<Post[] | null> {
    return this.get(`feed:${userId}`)
  }
  
  async setUserFeed(userId: string, posts: Post[]): Promise<void> {
    await this.set(`feed:${userId}`, posts, 300) // 5 minutos
  }
}
```

#### Connection Pooling

```typescript
// Connection pooling de Prisma
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=10&pool_timeout=20`
    }
  }
})
```

### Optimizaciones PWA

#### Caché del Service Worker

```javascript
// public/sw.js
const CACHE_NAME = 'socialconnect-v1'
const urlsToCache = [
  '/',
  '/offline',
  '/manifest.json',
  // Assets estáticos
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
        // Devolver versión cacheada o fetch de la red
        return response || fetch(event.request)
      })
  )
})
```

#### Background Sync

```javascript
// Background sync para acciones offline
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
      console.error('Sync falló:', error)
    }
  }
}
```

## Estrategia de Testing

### Testing Unitario con Vitest

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

  it('debe hacer login exitosamente', async () => {
    const authStore = useAuthStore()
    
    // Mock respuesta API
    global.$fetch = vi.fn().mockResolvedValue({
      success: true,
      data: {
        user: { id: '1', username: 'test' },
        accessToken: 'token'
      }
    })

    await authStore.login({
      identifier: 'test@ejemplo.com',
      password: 'contraseña'
    })

    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.user?.username).toBe('test')
  })

  it('debe manejar error de login', async () => {
    const authStore = useAuthStore()
    
    global.$fetch = vi.fn().mockRejectedValue({
      data: { message: 'Credenciales inválidas' }
    })

    await expect(authStore.login({
      identifier: 'inválido',
      password: 'incorrecto'
    })).rejects.toThrow()

    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.error).toBe('Credenciales inválidas')
  })
})
```

### Testing de Componentes

```typescript
// tests/components/PostCard.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PostCard from '~/components/post/PostCard.vue'

describe('PostCard', () => {
  const mockPost = {
    id: '1',
    content: 'Post de prueba',
    author: {
      id: '1',
      username: 'usuarioprueba',
      displayName: 'Usuario Prueba',
      verified: false
    },
    likesCount: 5,
    commentsCount: 2,
    sharesCount: 1,
    isLiked: false,
    createdAt: '2023-10-01T00:00:00.000Z'
  }

  it('renderiza el contenido del post correctamente', () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    expect(wrapper.text()).toContain('Post de prueba')
    expect(wrapper.text()).toContain('Usuario Prueba')
    expect(wrapper.text()).toContain('5 likes')
  })

  it('emite evento like cuando se hace clic en botón like', async () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    await wrapper.find('[data-testid="like-button"]').trigger('click')
    
    expect(wrapper.emitted('like')).toBeTruthy()
    expect(wrapper.emitted('like')?.[0]).toEqual(['1'])
  })
})
```

### Testing de API

```typescript
// tests/api/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, $fetch } from '@nuxt/test-utils'

describe('/api/auth', async () => {
  await setupTest({
    server: true
  })

  it('debe registrar nuevo usuario', async () => {
    const response = await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'test@ejemplo.com',
        username: 'usuarioprueba',
        password: 'Contraseña123!',
        displayName: 'Usuario Prueba'
      }
    })

    expect(response.success).toBe(true)
    expect(response.data.user.email).toBe('test@ejemplo.com')
    expect(response.data.accessToken).toBeDefined()
  })

  it('debe rechazar registro inválido', async () => {
    await expect($fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'email-invalido',
        username: 'tu',
        password: '123'
      }
    })).rejects.toThrow()
  })
})
```

### Testing E2E con Playwright

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Autenticación', () => {
  test('debe hacer login y navegar al feed', async ({ page }) => {
    await page.goto('/')
    
    // Debe redirigir a login
    await expect(page).toHaveURL('/auth/login')
    
    // Llenar formulario de login
    await page.fill('[data-testid="email-input"]', 'test@ejemplo.com')
    await page.fill('[data-testid="password-input"]', 'contraseña')
    await page.click('[data-testid="login-button"]')
    
    // Debe redirigir al feed
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-testid="feed"]')).toBeVisible()
  })

  test('debe crear y mostrar nuevo post', async ({ page }) => {
    // Asumir que el usuario está logueado
    await page.goto('/')
    
    // Crear nuevo post
    await page.fill('[data-testid="post-input"]', 'Este es un post de prueba')
    await page.click('[data-testid="post-submit"]')
    
    // Verificar que el post aparece en el feed
    await expect(page.locator('[data-testid="post"]').first())
      .toContainText('Este es un post de prueba')
  })
})
```

### Configuración de Testing

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

## Organización del Código

### Estructura de Directorios

```
social-media-platform/
├── assets/                 # Assets estáticos
│   ├── css/               # Estilos globales
│   ├── icons/             # Assets de iconos
│   └── images/            # Assets de imágenes
├── components/            # Componentes Vue
│   ├── ui/               # Componentes UI reutilizables
│   │   ├── Button.vue
│   │   ├── Modal.vue
│   │   ├── Input.vue
│   │   └── LoadingSpinner.vue
│   ├── forms/            # Componentes de formularios
│   │   ├── LoginForm.vue
│   │   ├── RegisterForm.vue
│   │   └── CreatePostForm.vue
│   ├── post/             # Componentes relacionados con posts
│   │   ├── PostCard.vue
│   │   ├── PostMedia.vue
│   │   ├── PostComments.vue
│   │   └── PostActions.vue
│   ├── messaging/        # Componentes de chat
│   │   ├── ConversationList.vue
│   │   ├── MessageList.vue
│   │   ├── MessageInput.vue
│   │   └── TypingIndicator.vue
│   └── story/            # Componentes de historias
│       ├── StoryViewer.vue
│       ├── StoryCarousel.vue
│       └── StoryCreator.vue
├── composables/          # Composables Vue
│   ├── useAuth.ts
│   ├── useInfiniteScroll.ts
│   ├── useWebSocket.ts
│   └── useFileUpload.ts
├── layouts/              # Layouts de páginas
│   ├── default.vue
│   ├── auth.vue
│   └── minimal.vue
├── middleware/           # Middleware de rutas
│   ├── auth.ts
│   └── guest.ts
├── pages/                # Enrutamiento basado en archivos
│   ├── index.vue         # Feed principal
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
├── plugins/              # Plugins Nuxt
│   ├── pinia.client.ts
│   └── socket.client.ts
├── prisma/               # Esquema de base de datos
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── public/               # Archivos estáticos
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── favicon.ico
│   └── sw.js
├── server/               # Código del lado del servidor
│   ├── api/             # Rutas API
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
│   ├── middleware/      # Middleware del servidor
│   │   └── auth.ts
│   ├── plugins/         # Plugins del servidor
│   │   └── websocket.ts
│   └── utils/           # Utilidades del servidor
│       ├── auth.ts
│       ├── prisma.ts
│       └── validation.ts
├── stores/               # Stores Pinia
│   ├── auth.ts
│   ├── posts.ts
│   ├── messaging.ts
│   └── stories.ts
├── types/                # Definiciones de tipos TypeScript
│   └── index.ts
├── utils/                # Utilidades del cliente
│   ├── format.ts
│   ├── upload.ts
│   └── constants.ts
└── tests/                # Archivos de test
    ├── api/
    ├── components/
    ├── e2e/
    └── setup.ts
```

### Convenciones de Nomenclatura

#### Archivos y Directorios
- **Componentes**: PascalCase (`PostCard.vue`)
- **Páginas**: kebab-case (`user-profile.vue`)
- **Composables**: camelCase con prefijo `use` (`useAuth.ts`)
- **Stores**: camelCase (`posts.ts`)
- **Rutas API**: Sufijo método HTTP (`.get.ts`, `.post.ts`)

#### Variables y Funciones
- **Variables**: camelCase (`userId`, `postData`)
- **Constantes**: SCREAMING_SNAKE_CASE (`API_BASE_URL`)
- **Funciones**: camelCase (`handleSubmit`, `fetchUserData`)
- **Interfaces TypeScript**: PascalCase (`User`, `PostForm`)

#### Clases CSS
- **Tailwind**: Clases utilitarias (`bg-blue-500`, `text-center`)
- **Personalizadas**: kebab-case (`post-card`, `message-input`)
- **BEM**: Componente__Elemento--Modificador (`sidebar__item--active`)

### Organización de Imports

```typescript
// 1. Imports Vue/Nuxt
import { ref, computed, onMounted } from 'vue'
import { defineStore } from 'pinia'

// 2. Imports de librerías externas
import { z } from 'zod'
import bcrypt from 'bcryptjs'

// 3. Imports internos (tipos primero)
import type { User, Post, ApiResponse } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { formatDate } from '~/utils/format'

// 4. Imports de componentes
import PostCard from '~/components/post/PostCard.vue'
import LoadingSpinner from '~/components/ui/LoadingSpinner.vue'
```

### Guía de Estilo de Código

#### Interfaces TypeScript

```typescript
// Usar nombres descriptivos de interfaces
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

// Usar tipos utilitarios para variaciones
type CreateUserData = Pick<UserProfileData, 'username' | 'displayName' | 'bio'>
type UpdateUserData = Partial<CreateUserData>
```

#### Manejo de Errores

```typescript
// Patrón consistente de manejo de errores
export async function createPost(postData: CreatePostData): Promise<Post> {
  try {
    const response = await $fetch<ApiResponse<Post>>('/api/posts', {
      method: 'POST',
      body: postData
    })
    
    if (!response.success) {
      throw new Error(response.error || 'Falló al crear el post')
    }
    
    return response.data
  } catch (error) {
    console.error('Error al crear post:', error)
    throw error instanceof Error ? error : new Error('Error desconocido')
  }
}
```

#### Mejores Prácticas Async/Await

```typescript
// Bien: Manejo apropiado de errores y limpieza
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

// Bien: Operaciones async paralelas
async function initializePage() {
  const [user, posts, conversations] = await Promise.all([
    authService.getCurrentUser(),
    postsService.getFeed(),
    messagingService.getConversations()
  ])
  
  return { user, posts, conversations }
}
```

## Dependencias

### Dependencias de Producción

| Paquete | Versión | Propósito | Licencia |
|---------|---------|-----------|----------|
| **@headlessui/vue** | ^1.7.16 | Componentes UI accesibles | MIT |
| **@heroicons/vue** | ^2.0.18 | Librería de iconos | MIT |
| **@nuxt/image** | ^1.0.0 | Optimización de imágenes | MIT |
| **@nuxtjs/google-fonts** | ^3.0.2 | Integración Google Fonts | MIT |
| **@pinia/nuxt** | ^0.5.1 | Gestión de estado | MIT |
| **@prisma/client** | ^5.5.0 | Cliente de base de datos | Apache-2.0 |
| **@sidebase/nuxt-auth** | ^0.6.0 | Módulo de autenticación | MIT |
| **@tailwindcss/forms** | ^0.5.6 | Estilos de formularios | MIT |
| **@tailwindcss/typography** | ^0.5.10 | Plugin de tipografía | MIT |
| **@vite-pwa/nuxt** | ^0.3.0 | Funcionalidad PWA | MIT |
| **@vueuse/core** | ^10.5.0 | Utilidades Vue composition | MIT |
| **@vueuse/nuxt** | ^10.5.0 | Integración Nuxt | MIT |
| **bcryptjs** | ^2.4.3 | Hashing de contraseñas | MIT |
| **compression** | ^1.7.4 | Compresión de respuestas | MIT |
| **drizzle-orm** | ^0.29.0 | ORM alternativo | Apache-2.0 |
| **drizzle-kit** | ^0.20.0 | Herramienta de migración | Apache-2.0 |
| **firebase** | ^10.5.0 | Notificaciones push | Apache-2.0 |
| **jsonwebtoken** | ^9.0.2 | Tokens JWT | MIT |
| **marked** | ^9.1.0 | Parser Markdown | MIT |
| **multer** | ^1.4.5-lts.1 | Manejo de subida de archivos | MIT |
| **nitro** | ^2.7.0 | Motor del servidor | MIT |
| **node-cron** | ^3.0.2 | Tareas programadas | ISC |
| **nuxt** | ^3.8.0 | Framework | MIT |
| **pinia** | ^2.1.7 | Gestión de estado | MIT |
| **postgres** | ^3.4.0 | Cliente PostgreSQL | Unlicense |
| **prisma** | ^5.5.0 | Toolkit de base de datos | Apache-2.0 |
| **sharp** | ^0.32.6 | Procesamiento de imágenes | Apache-2.0 |
| **socket.io** | ^4.7.2 | Servidor WebSocket | MIT |
| **socket.io-client** | ^4.7.2 | Cliente WebSocket | MIT |
| **tailwindcss** | ^3.3.0 | Framework CSS | MIT |
| **vue** | ^3.3.0 | Framework JavaScript | MIT |
| **vue-router** | ^4.2.0 | Router | MIT |
| **ws** | ^8.14.0 | Librería WebSocket | MIT |
| **zod** | ^3.22.0 | Validación de esquemas | MIT |

### Dependencias de Desarrollo

| Paquete | Versión | Propósito | Licencia |
|---------|---------|-----------|----------|
| **@nuxt/devtools** | latest | Herramientas de desarrollo | MIT |
| **@nuxt/eslint-config** | ^0.2.0 | Configuración ESLint | MIT |
| **@nuxt/test-utils** | ^3.8.0 | Utilidades de testing | MIT |
| **@types/bcryptjs** | ^2.4.6 | Definiciones TypeScript | MIT |
| **@types/compression** | ^1.7.5 | Definiciones TypeScript | MIT |
| **@types/jsonwebtoken** | ^9.0.5 | Definiciones TypeScript | MIT |
| **@types/multer** | ^1.4.11 | Definiciones TypeScript | MIT |
| **@types/node** | ^20.8.0 | Definiciones tipo Node.js | MIT |
| **@types/ws** | ^8.5.10 | Definiciones tipo WebSocket | MIT |
| **@vitest/ui** | ^0.34.0 | UI de testing | MIT |
| **@vue/test-utils** | ^2.4.0 | Utilidades testing Vue | MIT |
| **eslint** | ^8.50.0 | Linting de código | MIT |
| **happy-dom** | ^12.0.0 | Entorno DOM para testing | MIT |
| **sass** | ^1.69.0 | Preprocesador CSS | MIT |
| **typescript** | ^5.2.0 | Compilador TypeScript | Apache-2.0 |
| **vitest** | ^0.34.0 | Framework de testing | MIT |
| **vue-tsc** | ^1.8.0 | Compilador Vue TypeScript | MIT |

### Cumplimiento de Licencias

Todas las dependencias utilizan licencias permisivas (MIT, Apache-2.0, ISC, Unlicense) que permiten uso comercial, modificación y distribución. No se utilizan licencias GPL u otras licencias copyleft.

### Consideraciones de Seguridad

- Todas las dependencias se actualizan regularmente para parchear vulnerabilidades de seguridad
- Escaneo automatizado de dependencias con herramientas como `npm audit`
- Versiones fijadas para asegurar builds reproducibles
- Las dependencias de desarrollo se excluyen de los builds de producción

### Impacto en el Tamaño del Bundle

| Categoría | Tamaño (gzipped) | Impacto |
|-----------|------------------|---------|
| **Vue/Nuxt Core** | ~150KB | Framework esencial |
| **Librerías UI** | ~80KB | Headless UI, Heroicons |
| **Gestión Estado** | ~15KB | Pinia |
| **Utilidades** | ~50KB | VueUse, formateo fechas |
| **Estilos** | ~10KB | Tailwind CSS runtime |
| **Autenticación** | ~30KB | JWT, bcrypt (servidor) |
| **WebSocket** | ~25KB | Cliente Socket.IO |
| **Total (aprox.)** | ~360KB | Competitivo para las características |

---

*Esta documentación técnica se mantiene y actualiza automáticamente con cada lanzamiento. Para la versión más reciente y recursos adicionales, visita el repositorio del proyecto.*