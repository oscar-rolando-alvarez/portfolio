# Financial Analysis ML API Makefile

.PHONY: help install install-dev test test-cov lint format type-check security clean build run docker-build docker-up docker-down migrate upgrade-db

# Variables
PYTHON := python
PIP := pip
PYTEST := pytest
DOCKER_COMPOSE := docker-compose
ALEMBIC := alembic

# Default target
help:
	@echo "Available commands:"
	@echo "  install       Install production dependencies"
	@echo "  install-dev   Install all dependencies including dev tools"
	@echo "  test          Run tests"
	@echo "  test-cov      Run tests with coverage report"
	@echo "  lint          Run linting (flake8)"
	@echo "  format        Format code (black, isort)"
	@echo "  type-check    Run type checking (mypy)"
	@echo "  security      Run security checks (bandit, safety)"
	@echo "  clean         Clean up build artifacts"
	@echo "  build         Build the package"
	@echo "  run           Run the development server"
	@echo "  docker-build  Build Docker images"
	@echo "  docker-up     Start Docker services"
	@echo "  docker-down   Stop Docker services"
	@echo "  migrate       Create new database migration"
	@echo "  upgrade-db    Apply database migrations"

# Installation
install:
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

install-dev:
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	$(PIP) install -r requirements-dev.txt
	pre-commit install

# Testing
test:
	$(PYTEST) tests/ -v

test-cov:
	$(PYTEST) tests/ -v --cov=src --cov-report=html --cov-report=term --cov-report=xml

test-unit:
	$(PYTEST) tests/unit/ -v

test-integration:
	$(PYTEST) tests/integration/ -v

test-e2e:
	$(PYTEST) tests/e2e/ -v

# Code Quality
lint:
	flake8 src tests

format:
	black .
	isort .

format-check:
	black --check .
	isort --check-only .

type-check:
	mypy src

# Security
security:
	bandit -r src/
	safety check

# Development
run:
	uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

run-celery:
	celery -A src.infrastructure.messaging.celery_app worker --loglevel=info

run-celery-beat:
	celery -A src.infrastructure.messaging.celery_app beat --loglevel=info

run-flower:
	celery -A src.infrastructure.messaging.celery_app flower

# Docker
docker-build:
	$(DOCKER_COMPOSE) build

docker-up:
	$(DOCKER_COMPOSE) up -d

docker-up-dev:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d

docker-down:
	$(DOCKER_COMPOSE) down

docker-down-volumes:
	$(DOCKER_COMPOSE) down -v

docker-logs:
	$(DOCKER_COMPOSE) logs -f

docker-logs-api:
	$(DOCKER_COMPOSE) logs -f api

# Database
migrate:
	$(ALEMBIC) revision --autogenerate -m "$(msg)"

upgrade-db:
	$(ALEMBIC) upgrade head

downgrade-db:
	$(ALEMBIC) downgrade -1

reset-db:
	$(ALEMBIC) downgrade base
	$(ALEMBIC) upgrade head

# Build and Clean
build:
	$(PYTHON) -m build

clean:
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf htmlcov/
	rm -rf .coverage
	rm -rf .pytest_cache/
	rm -rf .mypy_cache/
	find . -type d -name __pycache__ -delete
	find . -type f -name "*.pyc" -delete

# All quality checks
check-all: format-check lint type-check security test

# CI pipeline simulation
ci: install-dev check-all test-cov

# Setup development environment
setup-dev: install-dev
	@echo "Setting up development environment..."
	@echo "Creating .env file from .env.example if it doesn't exist..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@echo "Development environment setup complete!"
	@echo "Run 'make docker-up-dev' to start the development services"