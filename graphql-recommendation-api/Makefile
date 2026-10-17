.PHONY: install lint format typecheck test run migrate docker-build up down

install:
	uv sync

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff check --fix .
	uv run ruff format .

typecheck:
	uv run mypy

test:
	uv run pytest

run:
	uv run uvicorn recommender.main:app --reload --port 8000

migrate:
	uv run alembic upgrade head

docker-build:
	docker build -t graphql-recommendation-api:local .

up:
	docker compose up --build

down:
	docker compose down -v
