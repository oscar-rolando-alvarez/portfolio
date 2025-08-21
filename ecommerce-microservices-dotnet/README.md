# E-Commerce Microservices Platform (.NET 8)

A comprehensive e-commerce platform built using .NET 8 microservices architecture with Domain-Driven Design (DDD), CQRS, Event Sourcing, and modern cloud-native patterns.

## Architecture Overview

This platform demonstrates a production-ready microservices architecture implementing:

- **Domain-Driven Design (DDD)** with bounded contexts
- **CQRS (Command Query Responsibility Segregation)** with MediatR
- **Event Sourcing** with EventStore
- **API Gateway** with Ocelot
- **Service-to-service communication** with RabbitMQ and MassTransit
- **Containerization** with Docker
- **Orchestration** with Kubernetes
- **Authentication & Authorization** with IdentityServer

## Microservices

### 1. Identity Service
- **Technology**: .NET 8, IdentityServer, SQL Server
- **Port**: 7000
- **Responsibilities**: Authentication, authorization, user management
- **Features**:
  - JWT token generation
  - User registration and login
  - OAuth 2.0 and OpenID Connect support
  - Role-based access control

### 2. Catalog Service
- **Technology**: .NET 8, MongoDB, AutoMapper
- **Port**: 7001
- **Responsibilities**: Product catalog management
- **Features**:
  - Product CRUD operations
  - Category management
  - Search and filtering
  - Product inventory tracking

### 3. Basket Service
- **Technology**: .NET 8, Redis, AutoMapper
- **Port**: 7002
- **Responsibilities**: Shopping cart management
- **Features**:
  - Add/remove items from basket
  - Basket persistence with Redis
  - Integration with Catalog service for product details
  - Session-based basket management

### 4. Ordering Service
- **Technology**: .NET 8, SQL Server, EventStore, CQRS
- **Port**: 7003
- **Responsibilities**: Order processing and management
- **Features**:
  - Order creation and tracking
  - CQRS implementation with MediatR
  - Event sourcing for order events
  - Integration with Payment service

### 5. Payment Service
- **Technology**: .NET 8, SQL Server
- **Port**: 7004
- **Responsibilities**: Payment processing
- **Features**:
  - Payment processing simulation
  - Multiple payment methods support
  - Payment status tracking
  - Integration events for order completion

### 6. API Gateway
- **Technology**: .NET 8, Ocelot
- **Port**: 7100
- **Responsibilities**: API composition and routing
- **Features**:
  - Request routing to microservices
  - Load balancing
  - Rate limiting
  - CORS support

## Technology Stack

### Backend
- **.NET 8**: Primary framework
- **C# 12**: Programming language
- **ASP.NET Core**: Web framework
- **Entity Framework Core**: ORM for SQL Server
- **MongoDB Driver**: NoSQL database access
- **StackExchange.Redis**: Redis client
- **MassTransit**: Message bus abstraction
- **MediatR**: CQRS implementation
- **AutoMapper**: Object mapping
- **FluentValidation**: Input validation
- **Serilog**: Structured logging

### Databases
- **SQL Server**: Transactional data (Identity, Ordering, Payment)
- **MongoDB**: Document storage (Catalog)
- **Redis**: Caching and session storage (Basket)
- **EventStore**: Event sourcing

### Message Broker
- **RabbitMQ**: Asynchronous communication between services

### Infrastructure
- **Docker**: Containerization
- **Docker Compose**: Local orchestration
- **Kubernetes**: Production orchestration

## Getting Started

### Prerequisites
- .NET 8 SDK
- Docker Desktop
- Visual Studio 2022 or VS Code

### Running with Docker Compose

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ecommerce-microservices-dotnet
   ```

2. **Start the infrastructure and services**
   ```bash
   docker-compose up -d
   ```

3. **Access the services**
   - API Gateway: http://localhost:7100
   - Identity Service: http://localhost:7000
   - Catalog Service: http://localhost:7001
   - Basket Service: http://localhost:7002
   - Ordering Service: http://localhost:7003
   - Payment Service: http://localhost:7004
   - RabbitMQ Management: http://localhost:15672 (guest/guest)

### Running Locally

1. **Start infrastructure services**
   ```bash
   docker-compose up -d sqlserver mongodb redis rabbitmq eventstore
   ```

2. **Run each service individually**
   ```bash
   # Identity Service
   cd src/Services/Identity/ECommerce.Services.Identity
   dotnet run

   # Catalog Service
   cd src/Services/Catalog/ECommerce.Services.Catalog
   dotnet run

   # And so on for other services...
   ```

## API Documentation

Each service exposes Swagger documentation:

- Identity: http://localhost:7000/swagger
- Catalog: http://localhost:7001/swagger
- Basket: http://localhost:7002/swagger
- Ordering: http://localhost:7003/swagger
- Payment: http://localhost:7004/swagger

## Architecture Patterns

### Domain-Driven Design (DDD)
- Each microservice represents a bounded context
- Rich domain models with business logic
- Clear separation of concerns
- Domain events for cross-boundary communication

### CQRS (Command Query Responsibility Segregation)
- Separate models for read and write operations
- Commands for state changes
- Queries for data retrieval
- MediatR for request/response handling

### Event Sourcing
- Events stored in EventStore
- Order aggregate events are persisted
- Event replay capabilities
- Audit trail for all changes

### Microservices Communication
- **Synchronous**: HTTP/REST for immediate responses
- **Asynchronous**: RabbitMQ with MassTransit for eventual consistency
- **Event-driven**: Integration events for cross-service communication

## Security

### Authentication & Authorization
- IdentityServer4 for centralized authentication
- JWT tokens for API access
- OAuth 2.0 and OpenID Connect protocols
- Role-based and claim-based authorization

### Best Practices
- HTTPS enforcement
- SQL injection prevention with parameterized queries
- Input validation with FluentValidation
- Structured logging for security monitoring

## Monitoring & Observability

### Logging
- Serilog for structured logging
- Log correlation with correlation IDs
- Centralized log aggregation ready

### Health Checks
- Built-in health check endpoints
- Database connectivity checks
- Redis connectivity checks
- Custom health checks for business logic

### Metrics
- Integration points for Application Insights
- Performance counters
- Custom business metrics

## Testing Strategy

### Unit Tests
- Domain logic testing
- Service layer testing
- Repository pattern testing

### Integration Tests
- API endpoint testing
- Database integration testing
- Message bus integration testing

### Contract Tests
- API contract validation
- Service interface contracts

## Deployment

### Docker
- Multi-stage Dockerfiles for optimal image size
- Production-ready container configurations
- Health check configurations

### Kubernetes
- Deployment manifests for each service
- Service discovery configuration
- ConfigMaps and Secrets management
- Horizontal Pod Autoscaling (HPA)

### CI/CD
- GitHub Actions workflows
- Automated testing
- Container image building
- Deployment automation

## Scalability Considerations

### Horizontal Scaling
- Stateless service design
- Load balancing with API Gateway
- Database per service pattern
- Shared-nothing architecture

### Performance Optimization
- Redis caching for frequently accessed data
- Database indexing strategies
- Async/await patterns for I/O operations
- Connection pooling

### Resilience Patterns
- Circuit breaker pattern
- Retry policies with exponential backoff
- Timeout configurations
- Graceful degradation

## Project Structure

```
ecommerce-microservices-dotnet/
├── src/
│   ├── Services/
│   │   ├── Identity/
│   │   ├── Catalog/
│   │   ├── Basket/
│   │   ├── Ordering/
│   │   └── Payment/
│   ├── ApiGateway/
│   └── Shared/
│       ├── Common/
│       ├── Events/
│       └── Contracts/
├── tests/
├── k8s/
├── .github/workflows/
├── docker-compose.yml
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## Support

For technical questions and support, please open an issue in the repository.

---

This e-commerce microservices platform demonstrates enterprise-grade architecture patterns and is suitable for production use with proper security hardening and infrastructure setup.