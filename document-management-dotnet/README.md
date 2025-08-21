# Enterprise Document Management System

A comprehensive enterprise document management system built with .NET 8, featuring multi-tenancy, advanced security, workflow automation, and scalable architecture.

## 🏗️ Architecture Overview

This system follows Domain-Driven Design (DDD) principles with Clean Architecture, implementing a multi-layered approach:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Web API       │  │    SignalR      │  │   Swagger   │ │
│  │  (Minimal APIs) │  │     Hubs        │  │    Docs     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                  Application Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   CQRS/MediatR  │  │   Validation    │  │   AutoMapper │ │
│  │   Commands      │  │   (FluentValid) │  │   Profiles   │ │
│  │   Queries       │  │                 │  │              │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                    Domain Layer                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │    Entities     │  │  Value Objects  │  │   Events    │ │
│  │  (Aggregates)   │  │                 │  │   Domain    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Repositories   │  │  Specifications │  │   Enums     │ │
│  │  (Interfaces)   │  │                 │  │             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                 Infrastructure Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  EF Core DbContext │ │   Storage      │  │ Identity &  │ │
│  │  Multi-Tenant    │  │   Providers    │  │   Security  │ │
│  │                  │  │                │  │             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Elasticsearch  │  │   Workflow     │  │ Background  │ │
│  │   Integration   │  │    Engine      │  │  Services   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Key Features

### Core Document Management
- ✅ **Multi-format Support**: PDF, Word, Excel, PowerPoint, Images, Videos, Archives
- ✅ **Version Control**: Complete versioning with branching and merging capabilities
- ✅ **Document Classification**: Automatic and manual tagging system
- ✅ **Full-text Search**: Powered by Elasticsearch with advanced filtering
- ✅ **OCR Processing**: Extract text from scanned documents and images
- ✅ **Document Preview**: Generate thumbnails and previews for various formats
- ✅ **Metadata Extraction**: Automatic extraction of document properties

### Security & Access Control
- ✅ **Multi-tenant Architecture**: Complete tenant isolation with shared infrastructure
- ✅ **Granular Permissions**: Read, Write, Delete, Share permissions at document/folder level
- ✅ **Role-based Access Control**: Hierarchical role system with inherited permissions
- ✅ **Policy-based Authorization**: Flexible policy engine for complex scenarios
- ✅ **Active Directory/LDAP Integration**: Enterprise authentication and user sync
- ✅ **JWT Authentication**: Secure token-based authentication
- ✅ **Document Encryption**: At-rest and in-transit encryption
- ✅ **Digital Signatures**: Document signing and verification
- ✅ **Audit Trail**: Comprehensive logging of all user actions
- ✅ **Compliance Ready**: SOC2, GDPR, HIPAA compliance features

### Workflow Engine
- ✅ **Visual Workflow Designer**: Drag-and-drop workflow creation
- ✅ **Approval Workflows**: Multi-level approval processes
- ✅ **Review Cycles**: Document review and feedback workflows
- ✅ **Conditional Logic**: Smart routing based on document content/metadata
- ✅ **Parallel Processing**: Execute multiple workflow branches simultaneously
- ✅ **Timer Steps**: Schedule workflow actions and deadlines
- ✅ **Email Integration**: Automated notifications and escalations
- ✅ **Custom Scripts**: Execute custom business logic within workflows

### Storage & Performance
- ✅ **Multi-provider Storage**: Azure Blob, Amazon S3, File System support
- ✅ **CDN Integration**: Global content delivery for fast access
- ✅ **Intelligent Caching**: Redis-based caching for optimal performance
- ✅ **Horizontal Scaling**: Microservices architecture ready
- ✅ **Background Processing**: Async document processing pipeline
- ✅ **Bulk Operations**: Efficient handling of large document sets

### Real-time Features
- ✅ **SignalR Integration**: Real-time notifications and updates
- ✅ **Live Collaboration**: Real-time document collaboration
- ✅ **Progress Tracking**: Live workflow and processing status
- ✅ **Instant Search**: Real-time search suggestions and results

## 🛠️ Technology Stack

### Backend
- **.NET 8**: Latest .NET framework with performance improvements
- **ASP.NET Core**: Web API with minimal APIs
- **Entity Framework Core**: Multi-tenant data access with SQL Server
- **MediatR**: CQRS implementation for clean separation
- **AutoMapper**: Object-to-object mapping
- **FluentValidation**: Robust input validation
- **SignalR**: Real-time communication
- **Quartz.NET**: Background job scheduling

### Storage & Search
- **Azure Blob Storage**: Primary cloud storage option
- **Amazon S3**: Alternative cloud storage
- **File System**: Local/NAS storage option
- **Elasticsearch**: Full-text search and analytics
- **Redis**: Caching and session management

### Security & Identity
- **ASP.NET Identity**: User management framework
- **JWT Bearer**: Token-based authentication
- **LDAP/Active Directory**: Enterprise directory integration
- **BCrypt**: Password hashing
- **Data Protection API**: Encryption at rest

### DevOps & Deployment
- **Docker**: Containerization
- **Kubernetes**: Container orchestration
- **GitHub Actions**: CI/CD pipeline
- **Serilog**: Structured logging
- **Health Checks**: Application monitoring

## 🏗️ Project Structure

```
DocumentManagement/
├── src/
│   ├── DocumentManagement.API/              # Web API layer
│   ├── DocumentManagement.Application/      # Application services & CQRS
│   ├── DocumentManagement.Domain/          # Domain entities & business logic
│   ├── DocumentManagement.Infrastructure/  # Data access & external services
│   ├── DocumentManagement.Storage/         # Storage abstraction layer
│   ├── DocumentManagement.Search/          # Elasticsearch integration
│   └── DocumentManagement.Workflow/        # Workflow engine
├── tests/
│   ├── DocumentManagement.Tests.Unit/      # Unit tests
│   └── DocumentManagement.Tests.Integration/ # Integration tests
├── docs/                                   # Documentation
├── docker/                                 # Docker configurations
└── k8s/                                   # Kubernetes manifests
```

## 🚀 Quick Start

### Prerequisites
- .NET 8 SDK
- SQL Server (LocalDB for development)
- Redis (optional, for caching)
- Elasticsearch (optional, for search)
- Docker (optional, for containerized deployment)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/document-management-dotnet.git
   cd document-management-dotnet
   ```

2. **Configure app settings**
   ```bash
   cp src/DocumentManagement.API/appsettings.json src/DocumentManagement.API/appsettings.Development.json
   # Edit connection strings and settings
   ```

3. **Run database migrations**
   ```bash
   dotnet ef database update --project src/DocumentManagement.Infrastructure --startup-project src/DocumentManagement.API
   ```

4. **Start the application**
   ```bash
   dotnet run --project src/DocumentManagement.API
   ```

5. **Access the API**
   - API: https://localhost:7001
   - Swagger: https://localhost:7001/swagger

### Docker Deployment

1. **Build and run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

2. **Access services**
   - API: http://localhost:8080
   - Elasticsearch: http://localhost:9200
   - Redis: localhost:6379

## 📋 Configuration

### Application Settings

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=(localdb)\\mssqllocaldb;Database=DocumentManagement;Trusted_Connection=true;",
    "Redis": "localhost:6379",
    "Elasticsearch": "http://localhost:9200"
  },
  "Storage": {
    "ProviderType": "FileSystem", // FileSystem, AzureBlob, AmazonS3
    "ContainerName": "documents",
    "ConnectionString": ""
  },
  "JWT": {
    "SecretKey": "your-secret-key-here-minimum-32-characters",
    "Issuer": "DocumentManagement",
    "Audience": "DocumentManagement",
    "ExpiryMinutes": 60
  },
  "LDAP": {
    "Enabled": false,
    "Server": "ldap.company.com",
    "Port": 389,
    "BaseDn": "DC=company,DC=com",
    "UserFilter": "sAMAccountName"
  }
}
```

## 🔐 Security Features

### Authentication
- JWT-based authentication with refresh tokens
- LDAP/Active Directory integration
- Multi-factor authentication support
- Password policies and complexity requirements

### Authorization
- Role-based access control (RBAC)
- Policy-based authorization
- Document-level permissions
- Folder inheritance
- Tenant isolation

### Data Protection
- Encryption at rest using Data Protection API
- TLS encryption in transit
- Secure key management
- Personal data anonymization (GDPR compliance)

## 🔍 Search Capabilities

### Elasticsearch Integration
- Full-text search across document content
- Metadata-based filtering
- Faceted search with aggregations
- Auto-complete and suggestions
- Search analytics and insights

### Search Features
- Boolean queries with AND/OR/NOT operators
- Wildcard and fuzzy matching
- Date range filtering
- File type filtering
- Advanced query syntax

## 🔄 Workflow System

### Workflow Types
- **Document Approval**: Multi-level approval processes
- **Review Cycles**: Peer review and feedback collection
- **Publication**: Content publishing workflows
- **Archive**: Document retention and disposal
- **Custom**: User-defined business processes

### Workflow Components
- **Steps**: Individual workflow actions
- **Transitions**: Conditional routing between steps
- **Actions**: User interactions (approve, reject, etc.)
- **Timers**: Time-based workflow progression
- **Notifications**: Email and in-app notifications

## 📊 Monitoring & Observability

### Logging
- Structured logging with Serilog
- Centralized log aggregation
- Error tracking and alerting
- Performance metrics

### Health Checks
- Database connectivity
- External service availability
- Storage provider health
- Search service status

### Metrics
- Document processing times
- Storage usage by tenant
- User activity analytics
- System performance metrics

## 🧪 Testing

### Unit Tests
```bash
dotnet test tests/DocumentManagement.Tests.Unit/
```

### Integration Tests
```bash
dotnet test tests/DocumentManagement.Tests.Integration/
```

### Test Coverage
- Domain logic: 95%+ coverage
- Application services: 90%+ coverage
- API endpoints: 85%+ coverage

## 🚀 Deployment

### Kubernetes Deployment

1. **Apply configurations**
   ```bash
   kubectl apply -f k8s/
   ```

2. **Monitor deployment**
   ```bash
   kubectl get pods -n document-management
   ```

### Azure Deployment

1. **Create Azure resources**
   ```bash
   az group create --name rg-document-management --location eastus
   az aks create --resource-group rg-document-management --name aks-document-management
   ```

2. **Deploy to AKS**
   ```bash
   az aks get-credentials --resource-group rg-document-management --name aks-document-management
   kubectl apply -f k8s/
   ```

## 🔧 Development

### Adding New Features

1. **Domain First**: Define entities and business rules in the Domain layer
2. **Application Layer**: Create commands/queries and handlers
3. **Infrastructure**: Implement repositories and external integrations
4. **API Layer**: Expose endpoints and configure routing
5. **Tests**: Add comprehensive unit and integration tests

### Code Standards
- Follow SOLID principles
- Use dependency injection
- Implement proper error handling
- Write comprehensive tests
- Document public APIs

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - User logout

### Document Endpoints
- `GET /api/documents` - List documents
- `POST /api/documents` - Upload document
- `GET /api/documents/{id}` - Get document details
- `PUT /api/documents/{id}` - Update document
- `DELETE /api/documents/{id}` - Delete document
- `GET /api/documents/{id}/download` - Download document
- `POST /api/documents/{id}/versions` - Create new version

### Search Endpoints
- `GET /api/search` - Search documents
- `GET /api/search/suggest` - Search suggestions
- `GET /api/search/facets` - Search facets

### Workflow Endpoints
- `GET /api/workflows` - List workflow definitions
- `POST /api/workflows` - Create workflow
- `POST /api/workflows/{id}/instances` - Start workflow instance
- `PUT /api/workflows/instances/{id}/actions` - Execute workflow action

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [API Documentation](https://localhost:7001/swagger)
- [Architecture Decision Records](docs/architecture/)
- [Deployment Guide](docs/deployment/)
- [Security Guide](docs/security/)
- [Performance Tuning](docs/performance/)

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 🆘 Support

For technical support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `docs/` folder

---

## 🏢 Enterprise Features

This system is designed for enterprise use with the following additional considerations:

- **Compliance**: SOC2, GDPR, HIPAA, ISO 27001 ready
- **Scalability**: Handles millions of documents with horizontal scaling
- **High Availability**: 99.9% uptime with proper deployment
- **Disaster Recovery**: Backup and restore capabilities
- **Multi-region**: Global deployment support
- **Enterprise SSO**: SAML, OAuth2, OpenID Connect integration
- **Advanced Analytics**: Business intelligence and reporting
- **API Management**: Rate limiting, throttling, and analytics

Built with ❤️ for enterprise document management needs.