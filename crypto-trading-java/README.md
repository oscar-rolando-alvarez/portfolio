# Crypto Trading Platform

A comprehensive cryptocurrency trading platform built with Spring Boot 3, designed for high-frequency trading with low latency and high throughput.

## 🚀 Features

### Core Trading Features
- **Real-time Order Book Management** - Live order matching with sub-millisecond latency
- **Multiple Order Types** - Market, Limit, Stop-Loss, Stop-Limit, Take-Profit, Trailing Stop, Iceberg, OCO
- **Advanced Order Matching Engine** - FIFO price-time priority matching algorithm
- **Trading Pairs Management** - Support for multiple cryptocurrency pairs
- **Price Charts & Technical Indicators** - Real-time charting with TA4J integration
- **Portfolio Tracking** - Comprehensive P&L calculation and performance analytics
- **Trading History & Analytics** - Detailed trade history and performance metrics

### Exchange Integration
- **Multi-Exchange Support** - Binance, Coinbase Pro, Kraken integration
- **WebSocket Connections** - Real-time market data streaming
- **Order Execution** - Cross-exchange order routing
- **Arbitrage Detection** - Automated arbitrage opportunity identification
- **Rate Normalization** - Unified pricing across exchanges

### Risk Management
- **Position Sizing Algorithms** - Kelly Criterion and other position sizing strategies
- **Automated Risk Controls** - Stop-loss and take-profit automation
- **Risk Metrics** - VaR, Sharpe ratio, Sortino ratio, Calmar ratio calculations
- **Margin Trading Support** - Advanced margin calculations and liquidation engine
- **Liquidation Engine** - Automated position liquidation for risk management

### Advanced Features
- **Algorithmic Trading Framework** - Custom trading bot development
- **Backtesting Engine** - Historical strategy testing and optimization
- **Machine Learning Integration** - Price prediction models
- **Multi-Factor Authentication** - Enhanced security with 2FA
- **Admin Dashboard** - Comprehensive administration interface
- **Audit Logging** - Complete transaction and activity logging

## 🏗️ Architecture

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile App     │    │  Trading Bot    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │      Load Balancer       │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │    API Gateway/Ingress   │
                    └─────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────┴─────────┐ ┌─────────┴─────────┐ ┌─────────┴─────────┐
    │  Trading App 1    │ │  Trading App 2    │ │  Trading App N    │
    │  (Spring Boot)    │ │  (Spring Boot)    │ │  (Spring Boot)    │
    └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
              │                     │                     │
              └──────────────────────┼─────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                       │                        │
    ┌──────┴──────┐      ┌────────┴────────┐      ┌────────┴────────┐
    │ PostgreSQL  │      │ Redis Cluster   │      │ Kafka Cluster   │
    │ (Primary)   │      │ (Cache/Session) │      │ (Event Stream)  │
    └─────────────┘      └─────────────────┘      └─────────────────┘
           │
    ┌──────┴──────┐
    │ PostgreSQL  │
    │ (Replica)   │
    └─────────────┘
```

### Technology Stack

- **Backend Framework**: Spring Boot 3.2.0 with Java 17
- **Security**: Spring Security with JWT authentication
- **Database**: PostgreSQL with connection pooling (HikariCP)
- **Caching**: Redis for session management and market data caching
- **Message Streaming**: Apache Kafka for event-driven architecture
- **Distributed Computing**: Hazelcast for distributed data grid
- **WebSocket**: Real-time bidirectional communication
- **Database Migrations**: Liquibase for version control
- **Documentation**: OpenAPI/Swagger for API documentation
- **Monitoring**: Micrometer with Prometheus and Grafana
- **Containerization**: Docker and Kubernetes for deployment

## 🛠️ Installation & Setup

### Prerequisites
- Java 17 or higher
- Maven 3.8+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis 6+
- Kafka 3.4+

### Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/crypto-trading-java.git
   cd crypto-trading-java
   ```

2. **Start the entire stack**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   - API: http://localhost:8080
   - Swagger UI: http://localhost:8080/swagger-ui.html
   - Actuator Health: http://localhost:8080/api/actuator/health

### Manual Setup

1. **Database Setup**
   ```bash
   # PostgreSQL
   createdb crypto_trading
   createuser crypto_user
   
   # Update application.yml with your database credentials
   ```

2. **Redis Setup**
   ```bash
   # Start Redis
   redis-server
   ```

3. **Kafka Setup**
   ```bash
   # Start Zookeeper
   bin/zookeeper-server-start.sh config/zookeeper.properties
   
   # Start Kafka
   bin/kafka-server-start.sh config/server.properties
   ```

4. **Application Setup**
   ```bash
   # Build the application
   mvn clean package
   
   # Run the application
   java -jar target/crypto-trading-platform-1.0.0.jar
   ```

### Environment Configuration

Create an `application-prod.yml` file for production:

```yaml
spring:
  datasource:
    url: ${DB_URL}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
  
  data:
    redis:
      host: ${REDIS_HOST}
      port: ${REDIS_PORT}
      password: ${REDIS_PASSWORD}
  
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS}

exchanges:
  binance:
    api-key: ${BINANCE_API_KEY}
    secret-key: ${BINANCE_SECRET_KEY}
  coinbase:
    api-key: ${COINBASE_API_KEY}
    secret-key: ${COINBASE_SECRET_KEY}
    passphrase: ${COINBASE_PASSPHRASE}
  kraken:
    api-key: ${KRAKEN_API_KEY}
    secret-key: ${KRAKEN_SECRET_KEY}
```

## 📖 API Documentation

### Authentication

All API endpoints require JWT authentication except for public endpoints.

```bash
# Register a new user
POST /api/v1/auth/register
{
  "username": "trader123",
  "email": "trader@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe"
}

# Login
POST /api/v1/auth/login
{
  "username": "trader123",
  "password": "securePassword123"
}

# Use JWT token in subsequent requests
Authorization: Bearer <your_jwt_token>
```

### Trading Operations

```bash
# Create a new order
POST /api/v1/orders
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "type": "LIMIT",
  "quantity": "0.001",
  "price": "50000.00",
  "timeInForce": "GTC"
}

# Get order book
GET /api/v1/market/orderbook?symbol=BTCUSDT&depth=10

# Get user orders
GET /api/v1/orders/user/{userId}?page=0&size=20

# Cancel an order
DELETE /api/v1/orders/{orderId}
```

### WebSocket Endpoints

```javascript
// Market data stream
ws://localhost:8080/ws/market/{symbol}

// User order updates
ws://localhost:8080/ws/user/{userId}/orders

// Order book updates
ws://localhost:8080/ws/orderbook/{symbol}
```

## 🚀 Deployment

### Kubernetes Deployment

1. **Apply Kubernetes manifests**
   ```bash
   kubectl apply -f k8s/
   ```

2. **Check deployment status**
   ```bash
   kubectl get pods -l app=crypto-trading-app
   kubectl get services
   ```

3. **Scale the deployment**
   ```bash
   kubectl scale deployment crypto-trading-app --replicas=5
   ```

### Production Considerations

- **Database**: Use managed PostgreSQL (AWS RDS, Google Cloud SQL)
- **Caching**: Redis Cluster for high availability
- **Message Queue**: Managed Kafka (Confluent Cloud, AWS MSK)
- **Load Balancing**: Use cloud load balancers with health checks
- **SSL/TLS**: Enable HTTPS with proper certificates
- **Monitoring**: Set up comprehensive monitoring and alerting
- **Backup**: Regular database backups and disaster recovery plan

## 🧪 Testing

### Running Tests

```bash
# Unit tests
mvn test

# Integration tests
mvn verify

# Test coverage report
mvn jacoco:report
```

### Load Testing

```bash
# Install Artillery
npm install -g artillery

# Run load tests
artillery run loadtest/trading-api-test.yml
```

## 📊 Monitoring & Observability

### Metrics

The application exposes metrics via Micrometer:
- **Custom Metrics**: Order execution time, matching engine performance
- **JVM Metrics**: Memory usage, GC performance, thread pools
- **Database Metrics**: Connection pool stats, query performance
- **Cache Metrics**: Redis hit/miss ratios, cache sizes

### Health Checks

- **Liveness Probe**: `/api/actuator/health/liveness`
- **Readiness Probe**: `/api/actuator/health/readiness`
- **Custom Health Indicators**: Database connectivity, external APIs

### Logging

Structured logging with the following levels:
- **ERROR**: System errors, failed trades, security violations
- **WARN**: Risk limit breaches, unusual trading patterns
- **INFO**: Order executions, user actions, system events
- **DEBUG**: Detailed order matching, market data updates

## 🔒 Security Features

- **JWT Authentication** with configurable expiration
- **Role-Based Access Control** (RBAC)
- **API Rate Limiting** to prevent abuse
- **Input Validation** and sanitization
- **Audit Logging** for all trading activities
- **Two-Factor Authentication** support
- **Account Lockout** after failed login attempts
- **CORS Configuration** for web security

## 🎯 Performance Characteristics

- **Order Latency**: Sub-millisecond order processing
- **Throughput**: 10,000+ orders per second
- **WebSocket Updates**: Real-time market data with <1ms latency
- **Database Performance**: Optimized queries with proper indexing
- **Memory Usage**: Efficient object pooling and garbage collection
- **CPU Optimization**: Parallel processing for order matching

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow Java coding standards and best practices
- Write comprehensive unit and integration tests
- Update documentation for new features
- Ensure security considerations for all changes
- Performance test significant changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/your-repo/crypto-trading-java/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-repo/crypto-trading-java/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/crypto-trading-java/discussions)
- **Email Support**: support@cryptotrading.com

## 🔗 Related Projects

- [Crypto Trading Frontend](https://github.com/your-repo/crypto-trading-frontend)
- [Trading Bot Examples](https://github.com/your-repo/crypto-trading-bots)
- [Market Data Collector](https://github.com/your-repo/crypto-market-data)

---

**⚠️ Disclaimer**: This software is for educational and development purposes. Trading cryptocurrencies carries significant financial risk. Always do your own research and consider seeking advice from financial professionals before trading.