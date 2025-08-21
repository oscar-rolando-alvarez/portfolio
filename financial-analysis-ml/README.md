# Financial Analysis ML API

A comprehensive financial analysis system with machine learning capabilities built using FastAPI, PostgreSQL, Redis, and Celery. The system follows hexagonal architecture principles and includes features for portfolio management, financial instrument tracking, price data analysis, and ML-powered predictions.

## Features

- **RESTful API** with OpenAPI documentation
- **JWT Authentication** with secure user management
- **Portfolio Management** with real-time position tracking
- **Financial Instrument** data management and price tracking
- **Machine Learning Models** for financial predictions (LSTM, Random Forest, etc.)
- **Async Task Processing** with Celery for ML training and predictions
- **Redis Caching** for improved performance
- **Comprehensive Testing** with pytest
- **Docker Support** for development and production
- **CI/CD Pipeline** with GitHub Actions
- **Monitoring** with Celery Flower and health checks

## Architecture

The application follows **Hexagonal Architecture** (Clean Architecture) principles:

```
src/
├── domain/           # Core business logic
│   ├── entities/     # Domain entities
│   ├── value_objects/# Value objects
│   ├── repositories/ # Repository interfaces
│   ├── services/     # Domain services
│   └── exceptions/   # Domain exceptions
├── application/      # Application layer
│   ├── use_cases/    # Business use cases
│   ├── services/     # Application services
│   └── dto/          # Data transfer objects
├── infrastructure/   # Infrastructure layer
│   ├── database/     # Database implementation
│   ├── cache/        # Cache implementation
│   ├── ml/           # ML models and services
│   ├── messaging/    # Celery tasks
│   └── external_apis/# External API clients
└── api/              # API layer
    ├── endpoints/    # FastAPI endpoints
    ├── middleware/   # Middleware
    ├── dependencies/ # Dependencies
    └── schemas/      # Pydantic schemas
```

## Technologies

- **Backend**: FastAPI, Python 3.11+
- **Database**: PostgreSQL with SQLAlchemy (async)
- **Cache**: Redis
- **Message Queue**: Celery with Redis broker
- **ML**: scikit-learn, TensorFlow, pandas, numpy
- **Testing**: pytest, pytest-asyncio
- **Containerization**: Docker, docker-compose
- **CI/CD**: GitHub Actions
- **Documentation**: OpenAPI/Swagger

## Quick Start

### Prerequisites

- Python 3.11+
- Docker and Docker Compose
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd financial-analysis-ml
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run with Docker Compose (Recommended)**
   ```bash
   # Development environment
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   
   # Production environment
   docker-compose up -d
   ```

4. **Alternative: Local development**
   ```bash
   # Create virtual environment
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   
   # Set up database
   docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15
   docker run -d --name redis -p 6379:6379 redis:7
   
   # Run database migrations
   alembic upgrade head
   
   # Start the application
   uvicorn src.api.main:app --reload
   ```

### API Documentation

Once the application is running, visit:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

### Services

- **API**: http://localhost:8000
- **Celery Flower** (Task Monitoring): http://localhost:5555
- **pgAdmin** (Development): http://localhost:5050
- **Jupyter Lab** (Development): http://localhost:8888

## API Usage

### Authentication

1. **Register a new user**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
          "email": "user@example.com",
          "password": "SecurePassword123!",
          "first_name": "John",
          "last_name": "Doe"
        }'
   ```

2. **Login to get access token**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
          "email": "user@example.com",
          "password": "SecurePassword123!"
        }'
   ```

3. **Use the token in subsequent requests**
   ```bash
   curl -X GET "http://localhost:8000/api/v1/users/me" \
        -H "Authorization: Bearer <your-access-token>"
   ```

### Portfolio Management

1. **Create a portfolio**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/portfolios" \
        -H "Authorization: Bearer <token>" \
        -H "Content-Type: application/json" \
        -d '{
          "name": "My Portfolio",
          "description": "Investment portfolio",
          "base_currency": "USD"
        }'
   ```

2. **Add positions to portfolio**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/portfolios/{portfolio_id}/positions" \
        -H "Authorization: Bearer <token>" \
        -H "Content-Type: application/json" \
        -d '{
          "instrument_id": "<instrument-uuid>",
          "quantity": "100.0",
          "average_cost": "150.50"
        }'
   ```

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/unit/test_domain_entities.py

# Run integration tests
pytest tests/integration/
```

### Code Quality

```bash
# Format code
black .

# Sort imports
isort .

# Lint code
flake8 src tests

# Type checking
mypy src

# Security check
bandit -r src/

# Check dependencies for vulnerabilities
safety check
```

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "Description of changes"

# Apply migrations
alembic upgrade head

# Downgrade migration
alembic downgrade -1
```

### Celery Tasks

```bash
# Start Celery worker
celery -A src.infrastructure.messaging.celery_app worker --loglevel=info

# Start Celery beat (scheduler)
celery -A src.infrastructure.messaging.celery_app beat --loglevel=info

# Monitor tasks with Flower
celery -A src.infrastructure.messaging.celery_app flower
```

## ML Models

The system supports various machine learning models for financial predictions:

### Supported Models

- **LSTM**: Long Short-Term Memory neural networks for time series prediction
- **Random Forest**: Ensemble method for classification and regression
- **Linear Regression**: Simple linear models for trend analysis
- **ARIMA**: Autoregressive Integrated Moving Average for time series
- **Prophet**: Facebook's time series forecasting tool

### Model Training

Models are trained asynchronously using Celery tasks. You can trigger training through the API:

```bash
curl -X POST "http://localhost:8000/api/v1/predictions" \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "instrument_id": "<instrument-uuid>",
       "prediction_type": "PRICE_FORECAST",
       "model_type": "LSTM",
       "parameters": {
         "sequence_length": 60,
         "prediction_horizon_days": 30
       }
     }'
```

## Deployment

### Production Deployment

1. **Set environment variables**
   ```bash
   export ENVIRONMENT=production
   export DEBUG=false
   export JWT_SECRET_KEY="your-production-secret-key"
   # Set other production variables
   ```

2. **Deploy with Docker Compose**
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

3. **Run database migrations**
   ```bash
   docker-compose exec api alembic upgrade head
   ```

### Environment Variables

Key environment variables for production:

- `ENVIRONMENT=production`
- `DEBUG=false`
- `JWT_SECRET_KEY`: Strong secret key for JWT tokens
- `DATABASE_URL`: Production database URL
- `REDIS_URL`: Production Redis URL
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins
- `ALLOWED_HOSTS`: Comma-separated list of allowed hosts

## Monitoring and Observability

### Health Checks

- **API Health**: `GET /health`
- **Database Health**: Checked via SQLAlchemy connection
- **Redis Health**: Checked via Redis ping
- **Celery Health**: Monitored via Flower

### Logging

The application uses structured logging with configurable levels:

- **Console Logging**: Always enabled
- **File Logging**: Configurable with rotation
- **JSON Format**: Available for log aggregation systems

### Metrics

- **API Metrics**: Request/response times, error rates
- **Database Metrics**: Connection pool status, query performance
- **Celery Metrics**: Task success/failure rates, queue lengths
- **ML Metrics**: Model accuracy, training times, prediction latency

## Security

### Authentication & Authorization

- **JWT Tokens**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt
- **Rate Limiting**: Configurable rate limits per endpoint
- **CORS**: Configurable cross-origin resource sharing

### Data Protection

- **Input Validation**: Pydantic schemas for request validation
- **SQL Injection**: Prevented by SQLAlchemy ORM
- **XSS Protection**: Built-in FastAPI protections
- **HTTPS**: Recommended for production deployments

## Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and add tests
4. **Run tests**: `pytest`
5. **Run code quality checks**: `black . && isort . && flake8 && mypy`
6. **Commit your changes**: `git commit -m 'Add amazing feature'`
7. **Push to the branch**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Development Guidelines

- Follow **Clean Architecture** principles
- Write **comprehensive tests** for new features
- Use **type hints** throughout the codebase
- Follow **PEP 8** style guidelines
- Write **clear commit messages**
- Update **documentation** as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## Support

For technical support and questions:

- **Issues**: GitHub Issues
- **Documentation**: `/docs` endpoint when running the application
- **Health Check**: `/health` endpoint for service status

## Roadmap

- [ ] Real-time market data integration
- [ ] Advanced ML models (Transformers, Prophet)
- [ ] WebSocket support for real-time updates
- [ ] Mobile API endpoints
- [ ] Advanced portfolio analytics
- [ ] Risk management features
- [ ] Backtesting capabilities
- [ ] Multi-tenant support