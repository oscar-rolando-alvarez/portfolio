# SocialConnect - Modern Social Media Platform

A comprehensive social media platform built with Vue 3, Nuxt 3, and modern web technologies. Features real-time messaging, story sharing, advanced privacy controls, and a progressive web app experience.

## ✨ Features

### Core Features
- **User Authentication** - JWT-based authentication with refresh tokens
- **Posts & Media** - Create posts with text, images, and videos
- **Real-time Messaging** - WebSocket-powered instant messaging
- **Stories** - 24-hour disappearing stories with views tracking
- **Social Features** - Follow/unfollow, likes, comments, bookmarks
- **Advanced Feed** - Intelligent recommendation algorithm
- **Infinite Scroll** - Smooth infinite scrolling with pagination

### Advanced Features
- **Progressive Web App (PWA)** - Offline support and app-like experience
- **Push Notifications** - Real-time notifications for engagement
- **Content Moderation** - AI-powered content filtering
- **Privacy Controls** - Granular privacy settings and data controls
- **Analytics** - User interaction tracking and engagement metrics
- **Search** - Full-text search for users, posts, and hashtags
- **Media Compression** - Automatic image and video optimization

### Technical Features
- **Server-Side Rendering (SSR)** - SEO-optimized with Nuxt 3
- **Real-time Updates** - WebSocket integration with Socket.IO
- **Database** - PostgreSQL with Prisma ORM
- **State Management** - Pinia stores with TypeScript
- **Responsive Design** - Mobile-first design with Tailwind CSS
- **Type Safety** - Full TypeScript implementation

## 🛠 Tech Stack

### Frontend
- **Vue 3** - Progressive JavaScript framework with Composition API
- **Nuxt 3** - Full-stack framework with SSR/SSG
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Pinia** - State management
- **VueUse** - Collection of essential Vue utilities
- **Headless UI** - Unstyled, accessible UI components

### Backend
- **Nuxt 3 API Routes** - Server-side API endpoints
- **Prisma** - Modern database toolkit and ORM
- **PostgreSQL** - Robust relational database
- **Socket.IO** - Real-time bidirectional communication
- **JWT** - JSON Web Tokens for authentication
- **Bcrypt** - Password hashing

### Infrastructure
- **Docker** - Containerization for easy deployment
- **Redis** - Caching and session storage
- **Cloudinary** - Media storage and optimization
- **Firebase** - Push notifications
- **Nginx** - Reverse proxy and load balancing

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- PostgreSQL 13+
- Redis (optional, for caching)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd social-media-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your configuration values.

4. **Set up the database**
   ```bash
   # Install PostgreSQL and create database
   createdb socialconnect
   
   # Generate Prisma client and run migrations
   npx prisma generate
   npx prisma db push
   
   # Optional: Seed database with sample data
   npx prisma db seed
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Docker Setup

1. **Using Docker Compose (Recommended)**
   ```bash
   # Copy environment file
   cp .env.example .env
   
   # Start all services
   docker-compose up -d
   
   # Run database migrations
   docker-compose exec app npx prisma db push
   ```

2. **Access the application**
   - App: [http://localhost:3000](http://localhost:3000)
   - Database: localhost:5432
   - Redis: localhost:6379

## 📁 Project Structure

```
social-media-platform/
├── assets/                 # Static assets (CSS, images)
├── components/            # Vue components
│   ├── ui/               # Reusable UI components
│   ├── forms/            # Form components
│   ├── post/             # Post-related components
│   ├── messaging/        # Chat components
│   └── story/            # Story components
├── composables/          # Vue composables
├── layouts/              # Page layouts
├── middleware/           # Route middleware
├── pages/                # File-based routing
│   ├── auth/            # Authentication pages
│   ├── profile/         # User profile pages
│   ├── messages/        # Messaging interface
│   └── settings/        # App settings
├── plugins/              # Nuxt plugins
├── prisma/               # Database schema and migrations
├── public/               # Static files
├── server/               # Server-side code
│   ├── api/             # API routes
│   ├── middleware/      # Server middleware
│   ├── plugins/         # Server plugins
│   └── utils/           # Server utilities
├── stores/               # Pinia stores
├── types/                # TypeScript type definitions
├── utils/                # Client utilities
└── tests/                # Test files
```

## 🔧 Configuration

### Environment Variables

Key environment variables to configure:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database"

# Authentication
JWT_SECRET="your-secret-key"

# File Storage
CLOUDINARY_CLOUD_NAME="your-cloudinary-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Push Notifications
FIREBASE_PROJECT_ID="your-firebase-project"
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
```

### Database Schema

The application uses Prisma with PostgreSQL. Key models include:

- **User** - User accounts and profiles
- **Post** - User posts with media
- **Story** - Temporary stories
- **Message** - Real-time messaging
- **Conversation** - Chat conversations
- **Notification** - System notifications
- **Analytics** - User interaction tracking

## 🧪 Testing

Run the test suite:

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

## 🚀 Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build production image
docker build -t socialconnect .

# Run with environment variables
docker run -p 3000:3000 --env-file .env socialconnect
```

### Platform Deployment

The application can be deployed to various platforms:

- **Vercel** - Recommended for Nuxt 3
- **Netlify** - Static site generation
- **Railway** - Full-stack deployment
- **Heroku** - Container deployment
- **DigitalOcean** - VPS deployment

## 📊 Features Overview

### Authentication System
- JWT-based authentication with refresh tokens
- Social login (Google, GitHub)
- Password reset and email verification
- Session management

### Content Management
- Rich text posts with media upload
- Image and video compression
- Content moderation with AI
- Hashtag and mention support

### Real-time Features
- WebSocket connections for live updates
- Real-time messaging with typing indicators
- Live notifications
- Online status tracking

### Privacy & Security
- Granular privacy controls
- Content visibility settings
- Block and report functionality
- Data export and deletion

### Performance
- Server-side rendering for SEO
- Image optimization and lazy loading
- Infinite scroll with virtual lists
- Caching strategies with Redis

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Use conventional commit messages
- Ensure accessibility compliance
- Optimize for performance

## 📝 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Token refresh
- `GET /api/auth/me` - Current user info

### Posts Endpoints
- `GET /api/posts` - Get posts feed
- `POST /api/posts` - Create new post
- `GET /api/posts/:id` - Get specific post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like/unlike post

### Messaging Endpoints
- `GET /api/messages/conversations` - Get conversations
- `POST /api/messages/conversations` - Create conversation
- `GET /api/messages/conversations/:id/messages` - Get messages
- `POST /api/messages/conversations/:id/messages` - Send message

## 🔒 Security

- CSRF protection
- Rate limiting
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- Secure headers configuration

## 📱 Progressive Web App

- Offline functionality
- App installation prompt
- Background sync
- Push notifications
- Service worker caching

## 🎯 Performance Optimization

- Code splitting and lazy loading
- Image optimization with Nuxt Image
- Critical CSS inlining
- Browser caching strategies
- Database query optimization

## 📈 Analytics & Monitoring

- User interaction tracking
- Performance monitoring
- Error tracking and reporting
- Custom analytics dashboard
- A/B testing capabilities

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 🆘 Support

For technical support and questions:

- Create an issue on GitHub
- Check the documentation
- Review existing discussions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Vue.js team for the amazing framework
- Nuxt team for the full-stack solution
- Prisma team for the excellent ORM
- All contributors and community members

---

Built with ❤️ using Vue 3, Nuxt 3, and modern web technologies.