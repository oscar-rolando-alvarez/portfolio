.PHONY: install lint format typecheck test run docker-build up down

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
	uv run uvicorn financial_analysis.api.main:app --reload --port 8000

docker-build:
	docker build -t financial-analysis-ml:local .

up:
	docker compose up --build

down:
	docker compose down -v
