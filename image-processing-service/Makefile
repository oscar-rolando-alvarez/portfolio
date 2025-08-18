# Image Processing Service Makefile

.PHONY: help install dev-install test test-unit test-integration test-e2e test-coverage lint format type-check security-check clean build run dev docker-build docker-run docker-compose-up docker-compose-down k8s-deploy k8s-delete monitoring-up monitoring-down pre-commit docs

# Default target
help:
	@echo "Available commands:"
	@echo "  install          - Install production dependencies"
	@echo "  dev-install      - Install development dependencies"
	@echo "  test             - Run all tests"
	@echo "  test-unit        - Run unit tests only"
	@echo "  test-integration - Run integration tests only"
	@echo "  test-e2e         - Run end-to-end tests"
	@echo "  test-coverage    - Run tests with coverage report"
	@echo "  lint             - Run linting checks"
	@echo "  format           - Format code with black"
	@echo "  type-check       - Run type checking with mypy"
	@echo "  security-check   - Run security checks"
	@echo "  clean            - Clean temporary files"
	@echo "  build            - Build the application"
	@echo "  run              - Run the application locally"
	@echo "  dev              - Run in development mode"
	@echo "  docker-build     - Build Docker image"
	@echo "  docker-run       - Run Docker container"
	@echo "  docker-compose-up - Start all services with docker-compose"
	@echo "  docker-compose-down - Stop all services"
	@echo "  k8s-deploy       - Deploy to Kubernetes"
	@echo "  k8s-delete       - Delete from Kubernetes"
	@echo "  monitoring-up    - Start monitoring stack"
	@echo "  monitoring-down  - Stop monitoring stack"
	@echo "  pre-commit       - Run pre-commit hooks"
	@echo "  docs             - Generate documentation"

# Variables
PYTHON := python3
PIP := pip3
DOCKER := docker
DOCKER_COMPOSE := docker-compose
KUBECTL := kubectl
APP_NAME := image-processing-service
IMAGE_NAME := $(APP_NAME):latest
NAMESPACE := image-processing

# Installation
install:
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

dev-install: install
	$(PIP) install pytest pytest-asyncio pytest-cov black flake8 mypy pre-commit bandit safety

# Testing
test: test-unit test-integration

test-unit:
	pytest tests/unit/ -v --tb=short

test-integration:
	pytest tests/integration/ -v --tb=short

test-e2e:
	pytest tests/e2e/ -v --tb=short

test-coverage:
	pytest --cov=app --cov-report=html --cov-report=term-missing --cov-fail-under=80

# Code quality
lint:
	flake8 app/ tests/ --max-line-length=100 --exclude=__pycache__
	black --check app/ tests/

format:
	black app/ tests/
	isort app/ tests/

type-check:
	mypy app/ --ignore-missing-imports

security-check:
	bandit -r app/ -f json -o security-report.json
	safety check --json --output safety-report.json

# Development
clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf build/ dist/ .coverage htmlcov/ .pytest_cache/ .mypy_cache/
	rm -f security-report.json safety-report.json

build: clean
	$(PYTHON) setup.py sdist bdist_wheel

run:
	uvicorn app.main:app --host 0.0.0.0 --port 8000

dev:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level debug

# Docker
docker-build:
	$(DOCKER) build -t $(IMAGE_NAME) .

docker-run: docker-build
	$(DOCKER) run -p 8000:8000 --env-file .env $(IMAGE_NAME)

docker-compose-up:
	$(DOCKER_COMPOSE) up -d --build

docker-compose-down:
	$(DOCKER_COMPOSE) down -v

docker-compose-logs:
	$(DOCKER_COMPOSE) logs -f

# Kubernetes
k8s-create-namespace:
	$(KUBECTL) create namespace $(NAMESPACE) --dry-run=client -o yaml | $(KUBECTL) apply -f -

k8s-deploy: k8s-create-namespace
	$(KUBECTL) apply -f k8s/

k8s-delete:
	$(KUBECTL) delete -f k8s/ --ignore-not-found=true

k8s-status:
	$(KUBECTL) get all -n $(NAMESPACE)

k8s-logs:
	$(KUBECTL) logs -f deployment/$(APP_NAME)-app -n $(NAMESPACE)

k8s-describe:
	$(KUBECTL) describe deployment/$(APP_NAME)-app -n $(NAMESPACE)

# Monitoring
monitoring-up:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d prometheus grafana

monitoring-down:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml down

# Database
db-migrate:
	alembic upgrade head

db-migrate-create:
	alembic revision --autogenerate -m "$(MSG)"

db-reset:
	alembic downgrade base
	alembic upgrade head

# Pre-commit
pre-commit-install:
	pre-commit install

pre-commit:
	pre-commit run --all-files

# Documentation
docs:
	@echo "Generating API documentation..."
	$(PYTHON) -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=2))" > docs/openapi.json

# Performance testing
load-test:
	locust -f tests/performance/locustfile.py --host=http://localhost:8000

# Environment setup
setup-dev: dev-install pre-commit-install
	@echo "Development environment setup complete"
	@echo "Run 'make dev' to start the development server"

setup-prod:
	@echo "Setting up production environment..."
	$(MAKE) install
	$(MAKE) build

# Backup and restore
backup-db:
	pg_dump $(DATABASE_URL) > backup_$(shell date +%Y%m%d_%H%M%S).sql

restore-db:
	psql $(DATABASE_URL) < $(BACKUP_FILE)

# Health checks
health-check:
	curl -f http://localhost:8000/health/live || exit 1

ready-check:
	curl -f http://localhost:8000/health/ready || exit 1

# CI/CD helpers
ci-test: dev-install lint type-check security-check test-coverage

ci-build: docker-build
	$(DOCKER) tag $(IMAGE_NAME) $(REGISTRY)/$(IMAGE_NAME)

ci-push:
	$(DOCKER) push $(REGISTRY)/$(IMAGE_NAME)

# Release
release-patch:
	bump2version patch

release-minor:
	bump2version minor

release-major:
	bump2version major

# Utility commands
show-urls:
	@echo "Application URLs:"
	@echo "  API: http://localhost:8000"
	@echo "  Docs: http://localhost:8000/docs"
	@echo "  Health: http://localhost:8000/health"
	@echo "  Metrics: http://localhost:8000/metrics"
	@echo "  RabbitMQ Management: http://localhost:15672"
	@echo "  MinIO Console: http://localhost:9001"
	@echo "  Prometheus: http://localhost:9090"
	@echo "  Grafana: http://localhost:3000"

logs:
	tail -f logs/app.log

worker-logs:
	tail -f logs/worker.log

# Performance monitoring
monitor-cpu:
	top -p $(shell pgrep -f "uvicorn app.main:app")

monitor-memory:
	ps aux | grep "uvicorn app.main:app" | grep -v grep

# Data management
clear-cache:
	redis-cli FLUSHALL

clear-queue:
	rabbitmqctl purge_queue image_processing_tasks

# Development shortcuts
quick-test: lint test-unit
	@echo "Quick test suite completed"

full-check: lint type-check security-check test-coverage
	@echo "Full code quality check completed"

dev-setup: dev-install docker-compose-up
	@echo "Development environment is ready"
	@echo "Run 'make dev' to start the application"