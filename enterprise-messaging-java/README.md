# Enterprise Messaging System

A comprehensive, production-ready enterprise messaging system built with Spring Boot, featuring real-time communication, microservices architecture, and scalable event streaming.

## Features

### Core Messaging
- **Real-time messaging** via WebSocket with STOMP protocol
- **Thread support** for organized conversations
- **Message reactions** with emoji support
- **Read receipts** and delivery status tracking
- **Message editing and deletion** with audit trails
- **File attachments** with virus scanning
- **Message search** with full-text capabilities

### User Management
- **User registration and authentication** with JWT
- **Role-based access control** (User, Moderator, Admin, Super Admin)
- **Presence system** with online/offline status
- **Two-factor authentication** support
- **Account lockout** protection
- **Password reset** functionality

### Channels & Groups
- **Public and private channels**
- **Group messaging** with member management
- **Channel invitations** with expiration and usage limits
- **Admin controls** for moderation
- **Announcement channels** with restricted posting
- **Slow mode** for rate limiting

### Enterprise Features
- **Message encryption** for sensitive communications
- **Event streaming** with Apache Kafka
- **Audit logging** for compliance
- **Analytics and monitoring** with Prometheus/Grafana
- **File upload and sharing** with type restrictions
- **Admin dashboard** for system management

### Technical Features
- **Microservices architecture** ready
- **Horizontal scaling** support
- **Redis caching** for performance
- **Database migrations** with Liquibase
- **Comprehensive API documentation** with OpenAPI
- **Docker containerization**
- **Kubernetes deployment** manifests
- **Health checks and monitoring**

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile Client  │    │   Admin Panel   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │     (Nginx)     │
                    └─────────┬───────┘
                              │
                    ┌─────────────────┐
                    │  Messaging API  │
                    │  (Spring Boot)  │
                    └─────────┬───────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   PostgreSQL    │ │      Redis      │ │  Apache Kafka   │
│   (Database)    │ │    (Cache)      │ │ (Event Stream)  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Technology Stack

- **Backend**: Spring Boot 3.2, Java 17
- **Database**: PostgreSQL with Liquibase migrations
- **Cache**: Redis
- **Message Broker**: Apache Kafka
- **Real-time**: WebSocket with STOMP
- **Security**: Spring Security with JWT
- **Documentation**: OpenAPI 3.0
- **Monitoring**: Prometheus, Grafana
- **Containerization**: Docker, Docker Compose
- **Orchestration**: Kubernetes
- **Build**: Maven

## Quick Start

### Prerequisites
- Java 17+
- Docker and Docker Compose
- Maven 3.6+

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd enterprise-messaging-java
```

2. Start all services:
```bash
docker-compose up -d
```

3. Wait for services to be healthy:
```bash
docker-compose ps
```

4. Access the application:
- API: http://localhost:8080
- API Documentation: http://localhost:8080/swagger-ui.html
- Grafana: http://localhost:3000 (admin/admin)
- Prometheus: http://localhost:9090

### Local Development

1. Start infrastructure services:
```bash
docker-compose up -d postgres redis kafka zookeeper
```

2. Set environment variables:
```bash
export DATABASE_URL=jdbc:postgresql://localhost:5432/messaging_db
export DATABASE_USERNAME=messaging_user
export DATABASE_PASSWORD=messaging_pass
export REDIS_HOST=localhost
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
export JWT_SECRET=mySecretKey
```

3. Run the application:
```bash
mvn spring-boot:run
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/forgot-password` - Password reset

### Users
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update current user profile
- `GET /api/users/{id}` - Get user by ID
- `GET /api/users/search` - Search users

### Channels
- `GET /api/channels` - List public channels
- `POST /api/channels` - Create channel
- `GET /api/channels/{id}` - Get channel details
- `PUT /api/channels/{id}` - Update channel
- `DELETE /api/channels/{id}` - Delete channel
- `POST /api/channels/{id}/join` - Join channel
- `POST /api/channels/{id}/leave` - Leave channel

### Messages
- `GET /api/channels/{id}/messages` - Get channel messages
- `POST /api/channels/{id}/messages` - Send message
- `PUT /api/messages/{id}` - Edit message
- `DELETE /api/messages/{id}` - Delete message
- `POST /api/messages/{id}/reactions` - Add reaction
- `DELETE /api/messages/{id}/reactions/{emoji}` - Remove reaction

### File Upload
- `POST /api/files/upload` - Upload file
- `GET /api/files/{id}` - Download file

## WebSocket Events

Connect to `/ws` endpoint with authentication token.

### Sending Messages
```javascript
// Send message to channel
stompClient.send("/app/channel/123/message", {}, JSON.stringify({
  content: "Hello World!",
  type: "TEXT"
}));

// Add reaction
stompClient.send("/app/message/456/reaction", {}, JSON.stringify({
  emoji: "👍",
  add: true
}));
```

### Subscribing to Events
```javascript
// Subscribe to channel messages
stompClient.subscribe("/topic/channel/123", function(message) {
  const event = JSON.parse(message.body);
  // Handle message event
});

// Subscribe to presence updates
stompClient.subscribe("/topic/presence", function(message) {
  const presenceUpdate = JSON.parse(message.body);
  // Handle presence update
});
```

## Configuration

### Application Properties
Key configuration options in `application.yml`:

```yaml
messaging:
  jwt:
    secret: ${JWT_SECRET}
    expiration: 86400000
  encryption:
    enabled: ${ENCRYPTION_ENABLED:false}
    key: ${ENCRYPTION_KEY}
  file-upload:
    max-size: 50MB
    allowed-types: image/jpeg,image/png,video/mp4
```

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection URL
- `REDIS_HOST` - Redis server host
- `KAFKA_BOOTSTRAP_SERVERS` - Kafka broker addresses
- `JWT_SECRET` - JWT signing secret
- `ENCRYPTION_KEY` - Message encryption key (base64)

## Monitoring

### Health Checks
- `/actuator/health` - Application health status
- `/actuator/metrics` - Application metrics
- `/actuator/prometheus` - Prometheus metrics

### Grafana Dashboards
Pre-configured dashboards for:
- Application performance metrics
- Database connection pool status
- Kafka topic metrics
- Redis cache performance
- JVM metrics

## Security

### Authentication
- JWT-based authentication with configurable expiration
- Secure password hashing with BCrypt
- Account lockout after failed attempts
- Two-factor authentication support

### Authorization
- Role-based access control
- Method-level security annotations
- Resource-based permissions

### Data Protection
- Optional message encryption with AES
- Virus scanning for file uploads
- Input validation and sanitization
- SQL injection prevention

## Deployment

### Kubernetes
Deploy to Kubernetes cluster:

```bash
kubectl apply -f k8s/
```

### Production Considerations
- Use external databases (AWS RDS, Google Cloud SQL)
- Configure Redis Cluster for high availability
- Set up Kafka cluster with multiple brokers
- Enable SSL/TLS for all communications
- Configure proper backup strategies
- Set up log aggregation (ELK stack)

## Development

### Running Tests
```bash
mvn test
```

### Building
```bash
mvn clean package
```

### Code Quality
- Checkstyle for code formatting
- SpotBugs for static analysis
- JaCoCo for code coverage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation at `/swagger-ui.html`
- Review the application logs for debugging

## Roadmap

- [ ] Voice/Video calling integration
- [ ] Advanced search with Elasticsearch
- [ ] Message translation services
- [ ] Mobile push notifications
- [ ] AI-powered moderation
- [ ] Advanced analytics dashboard
- [ ] Multi-tenant support
- [ ] Federation with other messaging systems