# Financial Analysis ML System - Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Domain Model](#domain-model)
5. [Database Design](#database-design)
6. [API Documentation](#api-documentation)
7. [Machine Learning Components](#machine-learning-components)
8. [Authentication & Security](#authentication--security)
9. [Caching Strategy](#caching-strategy)
10. [Async Processing](#async-processing)
11. [Message Queue Architecture](#message-queue-architecture)
12. [Testing Strategy](#testing-strategy)
13. [Deployment](#deployment)
14. [Performance Optimizations](#performance-optimizations)
15. [SOLID Principles Implementation](#solid-principles-implementation)
16. [Code Quality & Standards](#code-quality--standards)

## System Overview

The Financial Analysis ML System is a comprehensive platform built with FastAPI that provides portfolio management, financial instrument tracking, price data analysis, and machine learning-powered predictions for financial markets. The system follows Clean Architecture (Hexagonal Architecture) principles to ensure maintainable, testable, and scalable code.

### Key Features
- RESTful API with OpenAPI documentation
- JWT-based authentication system
- Real-time portfolio management and tracking
- Financial instrument data management
- Machine Learning models for financial predictions (LSTM, Random Forest, etc.)
- Asynchronous task processing with Celery
- Redis caching for improved performance
- Comprehensive testing suite
- Docker containerization
- CI/CD pipeline support

## Architecture

The system implements **Hexagonal Architecture (Clean Architecture)** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                          API Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Endpoints  │  │ Middleware  │  │     Schemas         │  │
│  │             │  │             │  │   (Pydantic)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Use Cases   │  │  Services   │  │        DTOs         │  │
│  │             │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Domain Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Entities   │  │Value Objects│  │    Repositories     │  │
│  │             │  │             │  │   (Interfaces)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Database   │  │    Cache    │  │        ML           │  │
│  │ (PostgreSQL)│  │   (Redis)   │  │   (TensorFlow)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Messaging  │  │External APIs│  │     Storage         │  │
│  │  (Celery)   │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Benefits
- **Separation of Concerns**: Each layer has a specific responsibility
- **Dependency Inversion**: High-level modules don't depend on low-level modules
- **Testability**: Easy to unit test each layer independently
- **Flexibility**: Easy to swap implementations without affecting other layers
- **Maintainability**: Changes in one layer don't cascade to others

## Technology Stack

### Core Technologies
- **Python 3.11+**: Main programming language
- **FastAPI 0.104.1**: Modern web framework for APIs
- **Uvicorn**: ASGI server for production deployment
- **Pydantic 2.5.0**: Data validation and serialization

### Database & Storage
- **PostgreSQL 15**: Primary database with ACID compliance
- **SQLAlchemy 2.0.23**: ORM with async support
- **Alembic 1.13.0**: Database migration management
- **AsyncPG 0.29.0**: Async PostgreSQL driver

### Caching & Message Queue
- **Redis 7**: Caching layer and message broker
- **Celery 5.3.4**: Distributed task queue
- **Kombu 5.3.4**: Messaging library

### Machine Learning
- **TensorFlow 2.15.0**: Deep learning framework
- **scikit-learn 1.3.2**: Traditional ML algorithms
- **NumPy 1.24.3**: Numerical computing
- **Pandas 2.1.4**: Data manipulation and analysis

### Security & Authentication
- **PyJWT 2.8.0**: JSON Web Token implementation
- **bcrypt 4.1.2**: Password hashing
- **passlib 1.7.4**: Password hashing utilities

### Development & Testing
- **pytest**: Testing framework
- **pytest-asyncio**: Async testing support
- **Black**: Code formatting
- **isort**: Import sorting
- **mypy**: Static type checking
- **flake8**: Linting
- **bandit**: Security scanning

### Containerization & Deployment
- **Docker**: Containerization
- **docker-compose**: Multi-container orchestration
- **Nginx**: Reverse proxy and load balancing

## Domain Model

### Core Entities

#### User Entity
```python
@dataclass
class User:
    id: UUID
    email: Email
    password_hash: str
    first_name: str
    last_name: str
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime
    updated_at: datetime
```

**Responsibilities:**
- User account management
- Authentication credentials
- Profile information
- Account status tracking

#### Financial Instrument Entity
```python
@dataclass
class FinancialInstrument:
    id: UUID
    symbol: str
    name: str
    instrument_type: InstrumentType
    currency: Currency
    exchange: str
    sector: Optional[str]
    industry: Optional[str]
    description: Optional[str]
    metadata: Dict[str, Any]
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
```

**Supported Instrument Types:**
- STOCK
- BOND
- COMMODITY
- CURRENCY
- CRYPTO
- INDEX
- ETF
- OPTION
- FUTURE

#### Portfolio Entity
```python
@dataclass
class Portfolio:
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str]
    base_currency: Currency
    positions: List[PortfolioPosition]
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
```

**Portfolio Capabilities:**
- Position management
- P&L calculation
- Performance tracking
- Risk assessment

#### Portfolio Position Entity
```python
@dataclass
class PortfolioPosition:
    id: UUID
    instrument_id: UUID
    quantity: Decimal
    average_cost: Decimal
    current_price: Optional[Decimal]
    created_at: datetime
    updated_at: datetime
```

**Position Features:**
- Quantity tracking
- Cost basis calculation
- Unrealized P&L computation
- Market value assessment

#### Price Data Entity
```python
@dataclass
class PriceData:
    id: UUID
    instrument_id: UUID
    timestamp: datetime
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    close_price: Decimal
    volume: int
    adjusted_close: Optional[Decimal]
    dividend_amount: Optional[Decimal]
    split_coefficient: Optional[Decimal]
    created_at: datetime
```

#### Prediction Entity
```python
@dataclass
class Prediction:
    id: UUID
    user_id: UUID
    instrument_id: UUID
    prediction_type: PredictionType
    model_type: ModelType
    status: PredictionStatus
    parameters: Dict[str, Any]
    results: List[PredictionResult]
    model_accuracy: Optional[Decimal]
    model_version: Optional[str]
    training_data_start: Optional[datetime]
    training_data_end: Optional[datetime]
    prediction_horizon_days: Optional[int]
    error_message: Optional[str]
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
```

### Value Objects

#### Email Value Object
```python
@dataclass(frozen=True)
class Email:
    value: str
    
    def __post_init__(self):
        if not self._is_valid_email(self.value):
            raise ValueError(f"Invalid email format: {self.value}")
```

#### Password Value Object
```python
@dataclass(frozen=True)
class Password:
    value: str
    
    def __post_init__(self):
        if not self._has_required_complexity(self.value):
            raise ValueError("Password must meet complexity requirements")
```

#### Money Value Object
```python
@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: Currency
    
    def __add__(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError("Cannot add different currencies")
        return Money(self.amount + other.amount, self.currency)
```

## Database Design

### Schema Overview

The database schema is designed with PostgreSQL-specific features and includes:

#### Tables

**users**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

**financial_instruments**
```sql
CREATE TABLE financial_instruments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    instrument_type VARCHAR(50) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    exchange VARCHAR(20) NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_symbol_exchange UNIQUE (symbol, exchange)
);

CREATE INDEX idx_instruments_type_sector ON financial_instruments(instrument_type, sector);
CREATE INDEX idx_instruments_symbol ON financial_instruments(symbol);
CREATE INDEX idx_instruments_exchange ON financial_instruments(exchange);
```

**price_data**
```sql
CREATE TABLE price_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id UUID NOT NULL REFERENCES financial_instruments(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    open_price DECIMAL(15,6) NOT NULL,
    high_price DECIMAL(15,6) NOT NULL,
    low_price DECIMAL(15,6) NOT NULL,
    close_price DECIMAL(15,6) NOT NULL,
    volume INTEGER NOT NULL,
    adjusted_close DECIMAL(15,6),
    dividend_amount DECIMAL(15,6),
    split_coefficient DECIMAL(15,6),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_instrument_timestamp UNIQUE (instrument_id, timestamp)
);

CREATE INDEX idx_price_data_instrument_timestamp ON price_data(instrument_id, timestamp);
```

**portfolios**
```sql
CREATE TABLE portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_user_portfolio_name UNIQUE (user_id, name)
);

CREATE INDEX idx_user_portfolios ON portfolios(user_id, is_active);
```

**portfolio_positions**
```sql
CREATE TABLE portfolio_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id),
    instrument_id UUID NOT NULL REFERENCES financial_instruments(id),
    quantity DECIMAL(15,6) NOT NULL,
    average_cost DECIMAL(15,6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_portfolio_instrument UNIQUE (portfolio_id, instrument_id)
);

CREATE INDEX idx_portfolio_positions ON portfolio_positions(portfolio_id);
```

**predictions**
```sql
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    instrument_id UUID NOT NULL REFERENCES financial_instruments(id),
    prediction_type VARCHAR(50) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    parameters JSONB NOT NULL DEFAULT '{}',
    results JSONB DEFAULT '[]',
    model_accuracy DECIMAL(5,4),
    model_version VARCHAR(50),
    training_data_start TIMESTAMP WITH TIME ZONE,
    training_data_end TIMESTAMP WITH TIME ZONE,
    prediction_horizon_days INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_user_predictions ON predictions(user_id, status);
CREATE INDEX idx_instrument_predictions ON predictions(instrument_id, prediction_type);
CREATE INDEX idx_pending_predictions ON predictions(status, created_at);
```

### Database Features

#### JSONB Support
- Flexible metadata storage
- Efficient querying with GIN indexes
- Schema evolution without migrations

#### Constraints & Relationships
- Foreign key constraints ensure data integrity
- Unique constraints prevent duplicates
- Check constraints validate business rules

#### Indexing Strategy
- Composite indexes for common query patterns
- Partial indexes for filtered queries
- JSONB indexes for metadata queries

## API Documentation

### Authentication Endpoints

#### POST /api/v1/auth/register
Register a new user account.

**Request:**
```json
{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "first_name": "John",
    "last_name": "Doe"
}
```

**Response:**
```json
{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe",
    "is_active": true,
    "is_verified": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
}
```

#### POST /api/v1/auth/login
Authenticate user and receive access token.

**Request:**
```json
{
    "email": "user@example.com",
    "password": "SecurePassword123!"
}
```

**Response:**
```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "full_name": "John Doe",
        "is_active": true,
        "is_verified": false,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    }
}
```

### User Management Endpoints

#### GET /api/v1/users/me
Get current user profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe",
    "is_active": true,
    "is_verified": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
}
```

#### PUT /api/v1/users/me
Update current user profile.

**Request:**
```json
{
    "first_name": "Jane",
    "last_name": "Smith"
}
```

### Portfolio Management Endpoints

#### POST /api/v1/portfolios
Create a new portfolio.

**Request:**
```json
{
    "name": "My Investment Portfolio",
    "description": "Long-term investment strategy",
    "base_currency": "USD"
}
```

#### GET /api/v1/portfolios
Get all user portfolios.

**Response:**
```json
[
    {
        "id": "456e7890-e89b-12d3-a456-426614174000",
        "name": "My Investment Portfolio",
        "description": "Long-term investment strategy",
        "base_currency": "USD",
        "total_market_value": "10500.25",
        "total_cost_basis": "10000.00",
        "total_unrealized_pnl": "500.25",
        "total_unrealized_pnl_percent": "5.00",
        "position_count": 5,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
    }
]
```

#### POST /api/v1/portfolios/{portfolio_id}/positions
Add position to portfolio.

**Request:**
```json
{
    "instrument_id": "789e0123-e89b-12d3-a456-426614174000",
    "quantity": "100.0",
    "average_cost": "150.50"
}
```

### Error Handling

All endpoints follow consistent error response format:

```json
{
    "detail": "Error message description",
    "error_code": "SPECIFIC_ERROR_CODE",
    "timestamp": "2024-01-01T00:00:00Z"
}
```

### API Status Codes
- **200 OK**: Successful request
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Access denied
- **404 Not Found**: Resource not found
- **422 Unprocessable Entity**: Validation error
- **500 Internal Server Error**: Server error

## Machine Learning Components

### Architecture Overview

The ML system is built with a modular architecture supporting multiple algorithms:

```
┌─────────────────────────────────────────────────────┐
│                ML Pipeline                          │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Data Ingestion│  │Feature Eng.  │  │ Model Train│ │
│  │              │  │              │  │            │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
│           │                 │                │      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Data Cleaning│  │  Validation  │  │ Prediction │ │
│  │              │  │              │  │            │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Base ML Model Interface

```python
class BaseMLModel(ABC):
    def __init__(self, model_name: str, model_version: str = "1.0"):
        self.model_name = model_name
        self.model_version = model_version
        self.model = None
        self.is_trained = False
        self.training_metrics = {}
        self.feature_columns = []
    
    @abstractmethod
    async def prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features from raw data."""
        pass
    
    @abstractmethod
    async def train(self, training_data: pd.DataFrame, target_column: str, **kwargs) -> Dict[str, Any]:
        """Train the model."""
        pass
    
    @abstractmethod
    async def predict(self, data: pd.DataFrame, **kwargs) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """Make predictions with confidence intervals."""
        pass
    
    @abstractmethod
    async def evaluate(self, test_data: pd.DataFrame, target_column: str, **kwargs) -> Dict[str, float]:
        """Evaluate model performance."""
        pass
```

### LSTM Model Implementation

The LSTM model is specifically designed for financial time series prediction:

#### Key Features
- **Sequential Learning**: Captures temporal dependencies in financial data
- **Multiple LSTM Layers**: Deep architecture for complex pattern recognition
- **Dropout Regularization**: Prevents overfitting
- **Monte Carlo Dropout**: Uncertainty estimation for predictions
- **Feature Engineering**: Comprehensive technical indicators

#### Technical Specifications
- **Input Features**: OHLCV data + technical indicators
- **Sequence Length**: Configurable (default: 60 time steps)
- **Architecture**: 2-layer LSTM with dropout
- **Loss Function**: Mean Squared Error
- **Optimizer**: Adam with learning rate scheduling
- **Regularization**: Dropout + Early Stopping

#### Feature Engineering
The LSTM model includes automatic feature engineering:

```python
def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    # Moving Averages
    df['sma_5'] = df['close_price'].rolling(window=5).mean()
    df['sma_10'] = df['close_price'].rolling(window=10).mean()
    df['sma_20'] = df['close_price'].rolling(window=20).mean()
    
    # Exponential Moving Averages
    df['ema_12'] = df['close_price'].ewm(span=12).mean()
    df['ema_26'] = df['close_price'].ewm(span=26).mean()
    
    # MACD
    df['macd'] = df['ema_12'] - df['ema_26']
    df['macd_signal'] = df['macd'].ewm(span=9).mean()
    
    # RSI
    delta = df['close_price'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # Bollinger Bands
    df['bb_middle'] = df['close_price'].rolling(window=20).mean()
    bb_std = df['close_price'].rolling(window=20).std()
    df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
    df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
    df['bb_position'] = (df['close_price'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
    
    # Volatility
    df['volatility'] = df['close_price'].pct_change().rolling(window=20).std()
    
    return df
```

### Model Training Pipeline

#### Data Preparation
1. **Data Validation**: Ensure data quality and completeness
2. **Feature Engineering**: Add technical indicators
3. **Normalization**: Scale features using MinMaxScaler
4. **Sequence Creation**: Create time series sequences for LSTM
5. **Train/Validation Split**: Split data chronologically

#### Training Process
1. **Model Architecture**: Build LSTM network
2. **Compilation**: Configure optimizer and loss function
3. **Callbacks**: Early stopping and learning rate reduction
4. **Training**: Fit model with validation monitoring
5. **Evaluation**: Calculate performance metrics

#### Model Evaluation Metrics
- **MSE (Mean Squared Error)**: Primary loss function
- **MAE (Mean Absolute Error)**: Robust error measurement
- **RMSE (Root Mean Squared Error)**: Interpretable error metric
- **R² Score**: Explained variance
- **MAPE (Mean Absolute Percentage Error)**: Relative error

### Prediction Types

#### Price Forecast
- **Objective**: Predict future stock prices
- **Horizon**: 1-30 days ahead
- **Output**: Price values with confidence intervals

#### Trend Analysis
- **Objective**: Identify market trends (bullish/bearish)
- **Horizon**: Short to medium term
- **Output**: Trend classification with probability

#### Volatility Forecast
- **Objective**: Predict price volatility
- **Horizon**: Multiple time horizons
- **Output**: Volatility measures

#### Risk Assessment
- **Objective**: Evaluate portfolio risk
- **Metrics**: VaR, Expected Shortfall
- **Output**: Risk scores and recommendations

#### Anomaly Detection
- **Objective**: Detect unusual market behavior
- **Method**: Statistical and ML-based detection
- **Output**: Anomaly scores and alerts

## Authentication & Security

### JWT Implementation

The system uses JSON Web Tokens for stateless authentication:

#### Token Structure
```json
{
    "header": {
        "alg": "HS256",
        "typ": "JWT"
    },
    "payload": {
        "sub": "user_id",
        "exp": 1640995200,
        "iat": 1640991600,
        "type": "access"
    },
    "signature": "signature_hash"
}
```

#### Security Features
- **HMAC SHA-256**: Cryptographic signature
- **Expiration**: Short-lived tokens (30 minutes)
- **Refresh Tokens**: Long-lived tokens for renewal
- **Type Validation**: Access vs refresh token distinction

### Password Security

#### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

#### Hashing Implementation
```python
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )
```

### API Security

#### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```

#### Rate Limiting
- **Implementation**: Redis-based rate limiting
- **Limits**: 100 requests per minute per IP
- **Graceful Degradation**: Soft limits with warnings

#### Input Validation
- **Pydantic Models**: Automatic request validation
- **SQL Injection Prevention**: SQLAlchemy ORM protection
- **XSS Protection**: FastAPI built-in sanitization

### Security Headers

```python
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

## Caching Strategy

### Redis Implementation

The system uses Redis for multiple caching purposes:

#### Cache Categories

**1. Application Data Cache**
- User session data
- Frequently accessed portfolios
- Market data snapshots
- API response caching

**2. Computation Cache**
- ML model predictions
- Complex financial calculations
- Aggregated portfolio metrics

**3. Rate Limiting Cache**
- API request counters
- User action limits
- Abuse prevention

### Cache Implementation

```python
class RedisCache:
    def __init__(self, redis_url: str, default_ttl: int = 3600):
        self.redis_client = redis.from_url(redis_url)
        self.default_ttl = default_ttl
    
    async def get(self, key: str, use_json: bool = True) -> Optional[Any]:
        value = await self.redis_client.get(key)
        if value is None:
            return None
        
        if use_json:
            return json.loads(value)
        else:
            return pickle.loads(value)
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None, use_json: bool = True) -> bool:
        ttl = ttl or self.default_ttl
        
        if use_json:
            serialized_value = json.dumps(value, default=str)
        else:
            serialized_value = pickle.dumps(value)
        
        return await self.redis_client.setex(key, ttl, serialized_value)
```

### Cache Patterns

#### Cache-Aside Pattern
```python
async def get_portfolio_summary(portfolio_id: UUID) -> PortfolioSummary:
    cache_key = f"portfolio_summary:{portfolio_id}"
    
    # Try cache first
    cached_summary = await cache.get(cache_key)
    if cached_summary:
        return PortfolioSummary(**cached_summary)
    
    # Calculate and cache
    summary = await calculate_portfolio_summary(portfolio_id)
    await cache.set(cache_key, summary.dict(), ttl=300)  # 5 minutes
    
    return summary
```

#### Write-Through Pattern
```python
async def update_portfolio(portfolio: Portfolio) -> Portfolio:
    # Update database
    updated_portfolio = await repository.update(portfolio)
    
    # Update cache
    cache_key = f"portfolio:{portfolio.id}"
    await cache.set(cache_key, updated_portfolio.dict())
    
    return updated_portfolio
```

### Cache Invalidation

#### Time-based Expiration
- Market data: 1 minute
- Portfolio summaries: 5 minutes
- User sessions: 30 minutes
- ML predictions: 1 hour

#### Event-based Invalidation
```python
async def invalidate_portfolio_cache(portfolio_id: UUID):
    patterns = [
        f"portfolio:{portfolio_id}",
        f"portfolio_summary:{portfolio_id}",
        f"user_portfolios:*:{portfolio_id}:*"
    ]
    
    for pattern in patterns:
        await cache.clear_pattern(pattern)
```

## Async Processing

### Celery Configuration

Celery handles asynchronous task processing with Redis as both broker and result backend:

```python
celery_app = Celery("financial_analysis")

celery_app.conf.update(
    broker_url="redis://localhost:6379/1",
    result_backend="redis://localhost:6379/1",
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task routing
    task_routes={
        "financial_analysis.ml.*": {"queue": "ml_tasks"},
        "financial_analysis.data.*": {"queue": "data_tasks"},
        "financial_analysis.notifications.*": {"queue": "notification_tasks"},
    },
    
    # Worker settings
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
    
    # Retry settings
    task_retry_delay=60,
    task_max_retries=3,
    result_expires=3600,
)
```

### Task Categories

#### ML Tasks
```python
@celery_app.task(bind=True, base=MLTask, queue="ml_tasks")
def train_ml_model(self, prediction_id: str, model_type: str, training_data: List[Dict], parameters: Dict) -> Dict:
    """Train ML model for prediction."""
    try:
        # Initialize model
        if model_type == "LSTM":
            model = LSTMModel(**parameters)
        
        # Train model
        metrics = await model.train(training_data)
        
        # Save model
        model_path = f"models/{prediction_id}.joblib"
        await model.save_model(model_path)
        
        return {
            "status": "completed",
            "model_accuracy": metrics["r2"],
            "training_metrics": metrics
        }
    
    except Exception as e:
        logger.error(f"ML training failed: {e}")
        raise
```

#### Data Processing Tasks
```python
@celery_app.task(queue="data_tasks")
def update_market_data(instrument_ids: List[str]) -> Dict:
    """Update market data for instruments."""
    try:
        updated_count = 0
        
        for instrument_id in instrument_ids:
            # Fetch latest price data
            price_data = fetch_price_data(instrument_id)
            
            # Store in database
            await store_price_data(price_data)
            updated_count += 1
        
        return {
            "status": "completed",
            "updated_instruments": updated_count
        }
    
    except Exception as e:
        logger.error(f"Market data update failed: {e}")
        raise
```

### Task Monitoring

#### Celery Flower
Web-based monitoring dashboard for Celery:
- Real-time task monitoring
- Worker status and statistics
- Task history and results
- Resource usage metrics

#### Custom Monitoring
```python
@celery_app.task
def health_check():
    """Celery worker health check."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "worker_id": current_task.request.hostname
    }
```

## Message Queue Architecture

### Queue Design

The system uses multiple specialized queues:

```
┌─────────────────────────────────────────────────────┐
│                Redis Broker                         │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  ml_tasks    │  │ data_tasks   │  │notification│ │
│  │   Queue      │  │   Queue      │  │   Queue    │ │
│  │              │  │              │  │            │ │
│  │ - Training   │  │ - Market Data│  │ - Emails   │ │
│  │ - Prediction │  │ - Portfolio  │  │ - Alerts   │ │
│  │ - Evaluation │  │ - Calculations│  │ - Reports  │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Task Routing

```python
task_routes = {
    # ML tasks - GPU workers
    "financial_analysis.ml.train_model": {"queue": "ml_tasks"},
    "financial_analysis.ml.predict": {"queue": "ml_tasks"},
    
    # Data tasks - CPU workers
    "financial_analysis.data.update_prices": {"queue": "data_tasks"},
    "financial_analysis.data.calculate_metrics": {"queue": "data_tasks"},
    
    # Notifications - Low priority
    "financial_analysis.notifications.send_email": {"queue": "notification_tasks"},
}
```

### Error Handling

#### Retry Strategy
```python
@celery_app.task(bind=True, autoretry_for=(ConnectionError,), retry_kwargs={'max_retries': 3, 'countdown': 60})
def resilient_task(self, data):
    try:
        # Task logic here
        return process_data(data)
    except RetryableError as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    except NonRetryableError as exc:
        # Log and fail permanently
        logger.error(f"Non-retryable error in task {self.request.id}: {exc}")
        raise
```

#### Dead Letter Queue
Failed tasks are moved to a dead letter queue for manual inspection:

```python
@celery_app.task(bind=True)
def handle_failure(self, task_id, error, traceback):
    """Handle task failures."""
    failure_data = {
        "task_id": task_id,
        "error": str(error),
        "traceback": traceback,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Store in dead letter queue
    await redis_client.lpush("failed_tasks", json.dumps(failure_data))
    
    # Notify administrators
    await send_failure_notification(failure_data)
```

## Testing Strategy

### Testing Pyramid

The system implements a comprehensive testing strategy:

```
     /\
    /  \
   /____\     E2E Tests (Few)
  /      \
 /________\   Integration Tests (Some)
/          \
\__________/  Unit Tests (Many)
```

### Unit Tests

#### Domain Entity Tests
```python
class TestUser:
    def test_user_creation(self, sample_user_data):
        user = User.create(**sample_user_data)
        
        assert user.id is not None
        assert user.email.value == sample_user_data["email"]
        assert user.full_name == f"{sample_user_data['first_name']} {sample_user_data['last_name']}"
        assert user.is_active is True
        assert user.is_verified is False
    
    def test_password_hashing(self):
        password = "TestPassword123!"
        user = User.create("test@example.com", password, "Test", "User")
        
        # Password should be hashed
        assert user.password_hash != password
        
        # Should be able to verify
        password_obj = Password(password)
        assert password_obj.verify(user.password_hash)
```

#### Value Object Tests
```python
class TestEmail:
    def test_valid_email(self):
        email = Email("test@example.com")
        assert email.value == "test@example.com"
        assert email.domain == "example.com"
        assert email.local_part == "test"
    
    def test_invalid_email(self):
        with pytest.raises(ValueError):
            Email("invalid-email")
```

#### Use Case Tests
```python
class TestUserUseCases:
    @pytest.mark.asyncio
    async def test_create_user(self, test_db, sample_user_data):
        repository = UserRepositoryImpl(test_db)
        auth_service = AuthService("test-secret")
        use_cases = UserUseCases(repository, auth_service)
        
        request = CreateUserRequest(**sample_user_data)
        user = await use_cases.create_user(request)
        
        assert user.email == sample_user_data["email"]
        assert user.first_name == sample_user_data["first_name"]
```

### Integration Tests

#### API Endpoint Tests
```python
class TestAuthEndpoints:
    @pytest.mark.asyncio
    async def test_register_endpoint(self, client, sample_user_data):
        response = await client.post("/api/v1/auth/register", json=sample_user_data)
        
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == sample_user_data["email"]
        assert "id" in data
    
    @pytest.mark.asyncio
    async def test_login_endpoint(self, client, sample_user_data):
        # First register user
        await client.post("/api/v1/auth/register", json=sample_user_data)
        
        # Then login
        login_data = {
            "email": sample_user_data["email"],
            "password": sample_user_data["password"]
        }
        response = await client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
```

#### Database Tests
```python
class TestDatabaseOperations:
    @pytest.mark.asyncio
    async def test_user_repository(self, test_db, sample_user_data):
        repository = UserRepositoryImpl(test_db)
        
        # Create user
        user = User.create(**sample_user_data)
        created_user = await repository.create(user)
        
        # Retrieve user
        retrieved_user = await repository.get_by_id(created_user.id)
        assert retrieved_user.email.value == sample_user_data["email"]
        
        # Update user
        retrieved_user.update_profile(first_name="Updated")
        updated_user = await repository.update(retrieved_user)
        assert updated_user.first_name == "Updated"
```

### End-to-End Tests

#### Complete User Workflows
```python
class TestCompleteWorkflows:
    @pytest.mark.asyncio
    async def test_portfolio_management_workflow(self, client, authenticated_user):
        # Create portfolio
        portfolio_data = {
            "name": "Test Portfolio",
            "description": "E2E test portfolio",
            "base_currency": "USD"
        }
        
        response = await client.post(
            "/api/v1/portfolios",
            json=portfolio_data,
            headers={"Authorization": f"Bearer {authenticated_user.token}"}
        )
        assert response.status_code == 201
        portfolio = response.json()
        
        # Add position
        position_data = {
            "instrument_id": "test-instrument-id",
            "quantity": "100.0",
            "average_cost": "150.50"
        }
        
        response = await client.post(
            f"/api/v1/portfolios/{portfolio['id']}/positions",
            json=position_data,
            headers={"Authorization": f"Bearer {authenticated_user.token}"}
        )
        assert response.status_code == 200
        
        # Verify portfolio summary
        response = await client.get(
            f"/api/v1/portfolios/{portfolio['id']}",
            headers={"Authorization": f"Bearer {authenticated_user.token}"}
        )
        assert response.status_code == 200
        updated_portfolio = response.json()
        assert len(updated_portfolio["positions"]) == 1
```

### Test Configuration

#### Pytest Configuration
```python
# pytest.ini
[tool:pytest]
minversion = 6.0
addopts = -ra -q --strict-markers --strict-config
testpaths = tests
python_files = test_*.py *_test.py
python_classes = Test*
python_functions = test_*
markers = 
    slow: marks tests as slow
    integration: marks tests as integration tests
    unit: marks tests as unit tests
    e2e: marks tests as end-to-end tests
asyncio_mode = auto
```

#### Test Fixtures
```python
@pytest_asyncio.fixture
async def test_db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session_factory = sessionmaker(bind=engine, class_=AsyncSession)
    
    async with async_session_factory() as session:
        yield session
    
    await engine.dispose()

@pytest.fixture
def test_cache():
    from fakeredis import aioredis
    
    class TestRedisCache(RedisCache):
        def __init__(self):
            self.redis_client = aioredis.FakeRedis(decode_responses=True)
            self.default_ttl = 3600
    
    return TestRedisCache()
```

### Test Coverage

Target coverage metrics:
- **Overall Coverage**: 85%+
- **Domain Layer**: 95%+
- **Application Layer**: 90%+
- **Infrastructure Layer**: 80%+
- **API Layer**: 85%+

## Deployment

### Docker Configuration

#### Multi-stage Dockerfile
```dockerfile
# Build stage
FROM python:3.11-slim as builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y build-essential curl
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Production stage
FROM python:3.11-slim as production

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y libpq-dev && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app
COPY . .

RUN mkdir -p logs && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### Docker Compose Configuration
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: financial_analysis
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s

  api:
    build:
      context: .
      target: production
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@postgres:5432/financial_analysis
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/1
      JWT_SECRET_KEY: ${JWT_SECRET_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "8000:8000"

  celery_worker:
    build:
      context: .
      target: production
    command: celery -A src.infrastructure.messaging.celery_app worker --loglevel=info
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@postgres:5432/financial_analysis
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/1
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_flower:
    build:
      context: .
      target: production
    command: celery -A src.infrastructure.messaging.celery_app flower --port=5555
    environment:
      CELERY_BROKER_URL: redis://redis:6379/1
    ports:
      - "5555:5555"
    depends_on:
      - redis

volumes:
  postgres_data:
  redis_data:
```

### Environment Configuration

#### Production Environment Variables
```bash
# Application
ENVIRONMENT=production
DEBUG=false
API_HOST=0.0.0.0
API_PORT=8000

# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=financial_analysis
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}

# Redis
REDIS_URL=redis://redis:6379/0

# Celery
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/1

# JWT
JWT_SECRET_KEY=${JWT_SECRET_KEY}
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
ALLOWED_ORIGINS=https://your-frontend-domain.com
ALLOWED_HOSTS=your-api-domain.com

# Logging
LOG_LEVEL=INFO
LOG_FILE_ENABLED=true
LOG_JSON_FORMAT=true

# ML
ML_MODEL_STORAGE_PATH=/app/models
ML_MAX_EPOCHS=100
ML_BATCH_SIZE=32
```

### CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_financial_analysis
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
        pip install -r requirements-dev.txt
    
    - name: Run linting
      run: |
        flake8 src tests
        black --check src tests
        isort --check-only src tests
        mypy src
    
    - name: Run security checks
      run: |
        bandit -r src/
        safety check
    
    - name: Run tests
      run: |
        pytest --cov=src --cov-report=xml
        
    - name: Upload coverage
      uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: |
        docker build -t financial-analysis-ml:${{ github.sha }} .
        
    - name: Push to registry
      if: github.ref == 'refs/heads/main'
      run: |
        echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
        docker tag financial-analysis-ml:${{ github.sha }} ${{ secrets.DOCKER_REGISTRY }}/financial-analysis-ml:latest
        docker push ${{ secrets.DOCKER_REGISTRY }}/financial-analysis-ml:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - name: Deploy to production
      run: |
        # Deployment script here
        echo "Deploying to production..."
```

### Monitoring & Logging

#### Application Logging
```python
import logging
from pythonjsonlogger import jsonlogger

def setup_logging():
    logger = logging.getLogger()
    handler = logging.StreamHandler()
    
    formatter = jsonlogger.JsonFormatter(
        '%(asctime)s %(name)s %(levelname)s %(message)s'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
```

#### Health Checks
```python
@app.get("/health")
async def health_check():
    """Comprehensive health check."""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "checks": {}
    }
    
    # Database check
    try:
        await database.execute("SELECT 1")
        health_status["checks"]["database"] = "healthy"
    except Exception as e:
        health_status["checks"]["database"] = f"unhealthy: {e}"
        health_status["status"] = "unhealthy"
    
    # Redis check
    try:
        await redis_client.ping()
        health_status["checks"]["redis"] = "healthy"
    except Exception as e:
        health_status["checks"]["redis"] = f"unhealthy: {e}"
        health_status["status"] = "unhealthy"
    
    # Celery check
    try:
        i = celery_app.control.inspect()
        active = i.active()
        health_status["checks"]["celery"] = "healthy" if active else "no workers"
    except Exception as e:
        health_status["checks"]["celery"] = f"unhealthy: {e}"
    
    return health_status
```

## Performance Optimizations

### Database Optimizations

#### Connection Pooling
```python
engine = create_async_engine(
    database_url,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False
)
```

#### Query Optimization
```python
# Efficient portfolio loading with positions
async def get_portfolio_with_positions(portfolio_id: UUID) -> Portfolio:
    query = select(PortfolioModel).options(
        selectinload(PortfolioModel.positions).selectinload(
            PortfolioPositionModel.instrument
        )
    ).where(PortfolioModel.id == portfolio_id)
    
    result = await session.execute(query)
    portfolio_model = result.scalar_one_or_none()
    
    return portfolio_model
```

#### Indexing Strategy
```sql
-- Composite indexes for common queries
CREATE INDEX idx_price_data_instrument_timestamp ON price_data(instrument_id, timestamp DESC);
CREATE INDEX idx_portfolios_user_active ON portfolios(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_predictions_status_created ON predictions(status, created_at) WHERE status = 'pending';

-- Partial indexes for filtered queries
CREATE INDEX idx_active_instruments ON financial_instruments(symbol) WHERE is_active = true;

-- JSONB indexes for metadata queries
CREATE INDEX idx_instrument_metadata ON financial_instruments USING GIN (metadata);
```

### Caching Optimizations

#### Multi-level Caching
```python
class MultiLevelCache:
    def __init__(self, l1_cache, l2_cache):
        self.l1_cache = l1_cache  # Local memory cache
        self.l2_cache = l2_cache  # Redis cache
    
    async def get(self, key: str):
        # Try L1 cache first
        value = self.l1_cache.get(key)
        if value is not None:
            return value
        
        # Try L2 cache
        value = await self.l2_cache.get(key)
        if value is not None:
            # Populate L1 cache
            self.l1_cache.set(key, value, ttl=300)
            return value
        
        return None
```

#### Cache Warming
```python
@celery_app.task
def warm_cache():
    """Warm frequently accessed data."""
    # Pre-load popular portfolios
    popular_portfolios = get_popular_portfolios()
    for portfolio_id in popular_portfolios:
        cache_portfolio_summary(portfolio_id)
    
    # Pre-load market data
    major_instruments = get_major_instruments()
    for instrument_id in major_instruments:
        cache_latest_price(instrument_id)
```

### API Optimizations

#### Response Compression
```python
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

#### Pagination
```python
class PaginationParams:
    def __init__(self, page: int = 1, size: int = 50):
        self.page = max(1, page)
        self.size = min(100, max(1, size))
        self.offset = (self.page - 1) * self.size

@app.get("/api/v1/portfolios")
async def get_portfolios(
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user)
):
    portfolios = await portfolio_repository.get_by_user_id(
        current_user.id,
        offset=pagination.offset,
        limit=pagination.size
    )
    
    total = await portfolio_repository.count_by_user_id(current_user.id)
    
    return {
        "items": portfolios,
        "total": total,
        "page": pagination.page,
        "size": pagination.size,
        "pages": (total + pagination.size - 1) // pagination.size
    }
```

#### Background Processing
```python
@app.post("/api/v1/predictions")
async def create_prediction(
    request: CreatePredictionRequest,
    current_user: User = Depends(get_current_user)
):
    # Create prediction record
    prediction = await prediction_repository.create(request, current_user.id)
    
    # Queue ML training task
    train_ml_model.delay(
        prediction_id=str(prediction.id),
        model_type=request.model_type,
        parameters=request.parameters
    )
    
    return {"id": prediction.id, "status": "queued"}
```

### ML Optimizations

#### Model Caching
```python
class ModelCache:
    def __init__(self):
        self._models = {}
    
    async def get_model(self, model_type: str, version: str):
        cache_key = f"{model_type}:{version}"
        
        if cache_key not in self._models:
            model_path = f"models/{cache_key}.joblib"
            model = await self.load_model(model_path)
            self._models[cache_key] = model
        
        return self._models[cache_key]
```

#### Batch Predictions
```python
@celery_app.task
def batch_predictions(prediction_requests: List[Dict]):
    """Process multiple predictions in batch for efficiency."""
    # Group by model type
    grouped_requests = defaultdict(list)
    for request in prediction_requests:
        grouped_requests[request['model_type']].append(request)
    
    results = []
    for model_type, requests in grouped_requests.items():
        model = get_cached_model(model_type)
        
        # Batch prepare features
        all_data = [req['data'] for req in requests]
        features = model.prepare_features_batch(all_data)
        
        # Batch predict
        predictions = model.predict_batch(features)
        
        results.extend(predictions)
    
    return results
```

## SOLID Principles Implementation

### Single Responsibility Principle (SRP)

Each class has a single, well-defined responsibility:

#### User Repository
```python
class UserRepository(ABC):
    """Responsible only for user data persistence."""
    
    @abstractmethod
    async def create(self, user: User) -> User:
        pass
    
    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        pass
    
    @abstractmethod
    async def get_by_email(self, email: str) -> Optional[User]:
        pass
```

#### Authentication Service
```python
class AuthService:
    """Responsible only for authentication logic."""
    
    def create_access_token(self, user_id: str) -> str:
        pass
    
    def verify_token(self, token: str) -> Optional[str]:
        pass
```

### Open/Closed Principle (OCP)

The system is open for extension but closed for modification:

#### ML Model Extension
```python
# Base model defines interface
class BaseMLModel(ABC):
    @abstractmethod
    async def train(self, data: pd.DataFrame) -> Dict[str, Any]:
        pass

# New models extend without modifying existing code
class TransformerModel(BaseMLModel):
    async def train(self, data: pd.DataFrame) -> Dict[str, Any]:
        # Transformer-specific implementation
        pass

class ProphetModel(BaseMLModel):
    async def train(self, data: pd.DataFrame) -> Dict[str, Any]:
        # Prophet-specific implementation
        pass
```

#### Strategy Pattern for Predictions
```python
class PredictionStrategy(ABC):
    @abstractmethod
    async def predict(self, data: pd.DataFrame) -> PredictionResult:
        pass

class LSTMPredictionStrategy(PredictionStrategy):
    async def predict(self, data: pd.DataFrame) -> PredictionResult:
        # LSTM prediction logic
        pass

class RandomForestPredictionStrategy(PredictionStrategy):
    async def predict(self, data: pd.DataFrame) -> PredictionResult:
        # Random Forest prediction logic
        pass
```

### Liskov Substitution Principle (LSP)

Derived classes are substitutable for their base classes:

#### Repository Implementations
```python
# All repository implementations can be substituted
class UserRepositoryImpl(UserRepository):
    async def create(self, user: User) -> User:
        # SQLAlchemy implementation
        pass

class UserRepositoryMock(UserRepository):
    async def create(self, user: User) -> User:
        # In-memory implementation for testing
        pass

# Both can be used wherever UserRepository is expected
def create_user_use_case(repository: UserRepository):
    # Works with any implementation
    pass
```

### Interface Segregation Principle (ISP)

Interfaces are specific to client needs:

#### Separated Repository Interfaces
```python
# Instead of one large repository interface
class UserReadRepository(ABC):
    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        pass
    
    @abstractmethod
    async def get_by_email(self, email: str) -> Optional[User]:
        pass

class UserWriteRepository(ABC):
    @abstractmethod
    async def create(self, user: User) -> User:
        pass
    
    @abstractmethod
    async def update(self, user: User) -> User:
        pass

# Clients depend only on what they need
class UserQueryService:
    def __init__(self, repository: UserReadRepository):
        self.repository = repository

class UserCommandService:
    def __init__(self, repository: UserWriteRepository):
        self.repository = repository
```

### Dependency Inversion Principle (DIP)

High-level modules depend on abstractions, not concretions:

#### Use Case Dependencies
```python
class UserUseCases:
    def __init__(
        self,
        user_repository: UserRepository,  # Abstraction
        auth_service: AuthService,        # Abstraction
        cache: CacheInterface,            # Abstraction
    ):
        self.user_repository = user_repository
        self.auth_service = auth_service
        self.cache = cache

# Dependency injection configuration
def create_user_use_cases() -> UserUseCases:
    return UserUseCases(
        user_repository=UserRepositoryImpl(database),  # Concrete
        auth_service=JWTAuthService(settings.jwt_secret),  # Concrete
        cache=RedisCache(settings.redis_url),  # Concrete
    )
```

## Code Quality & Standards

### Code Formatting

#### Black Configuration
```toml
[tool.black]
line-length = 100
target-version = ['py311']
include = '\.pyi?$'
extend-exclude = '''
/(
  \.eggs
  | \.git
  | \.venv
  | build
  | dist
  | migrations
)/
'''
```

#### isort Configuration
```toml
[tool.isort]
profile = "black"
multi_line_output = 3
line_length = 100
include_trailing_comma = true
force_grid_wrap = 0
use_parentheses = true
ensure_newline_before_comments = true
src_paths = ["src", "tests"]
skip_glob = ["**/migrations/*"]
```

### Type Checking

#### mypy Configuration
```toml
[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_no_return = true
warn_unreachable = true
strict_equality = true
show_error_codes = true
```

### Documentation Standards

#### Docstring Format
```python
def calculate_portfolio_metrics(
    portfolio: Portfolio,
    price_data: List[PriceData]
) -> PortfolioMetrics:
    """Calculate comprehensive portfolio performance metrics.
    
    Args:
        portfolio: Portfolio entity containing positions
        price_data: Historical price data for calculations
        
    Returns:
        PortfolioMetrics object containing all calculated metrics
        
    Raises:
        ValueError: If portfolio is empty or price data is insufficient
        
    Example:
        >>> portfolio = Portfolio.create(user_id, "My Portfolio", Currency.USD)
        >>> price_data = get_price_data(portfolio.instrument_ids)
        >>> metrics = calculate_portfolio_metrics(portfolio, price_data)
        >>> print(f"Total return: {metrics.total_return_percent}%")
    """
```

### Error Handling

#### Custom Exception Hierarchy
```python
class FinancialAnalysisException(Exception):
    """Base exception for financial analysis system."""
    
    def __init__(self, message: str, error_code: str = None):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)

class DomainException(FinancialAnalysisException):
    """Base exception for domain layer."""
    pass

class UserException(DomainException):
    """User-related exceptions."""
    pass

class UserNotFoundException(UserException):
    def __init__(self, user_id: str = None, email: str = None):
        if user_id:
            message = f"User with ID {user_id} not found"
        elif email:
            message = f"User with email {email} not found"
        else:
            message = "User not found"
        
        super().__init__(message, "USER_NOT_FOUND")
```

### Logging Standards

#### Structured Logging
```python
import structlog

logger = structlog.get_logger(__name__)

async def create_portfolio(user_id: UUID, request: CreatePortfolioRequest) -> Portfolio:
    logger.info(
        "Creating portfolio",
        user_id=str(user_id),
        portfolio_name=request.name,
        base_currency=request.base_currency.value
    )
    
    try:
        portfolio = Portfolio.create(
            user_id=user_id,
            name=request.name,
            description=request.description,
            base_currency=request.base_currency
        )
        
        created_portfolio = await portfolio_repository.create(portfolio)
        
        logger.info(
            "Portfolio created successfully",
            user_id=str(user_id),
            portfolio_id=str(created_portfolio.id),
            portfolio_name=created_portfolio.name
        )
        
        return created_portfolio
        
    except Exception as e:
        logger.error(
            "Failed to create portfolio",
            user_id=str(user_id),
            portfolio_name=request.name,
            error=str(e),
            exc_info=True
        )
        raise
```

This comprehensive technical documentation covers all aspects of the Financial Analysis ML System, from high-level architecture to implementation details, following industry best practices and clean code principles.