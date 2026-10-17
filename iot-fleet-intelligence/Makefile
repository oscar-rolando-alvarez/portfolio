SHELL := /bin/bash
.DEFAULT_GOAL := help

SIM_BIN := $(CURDIR)/simulator/bin/fleetsim
DEMO_DEVICES ?= 100000
UP_FLAGS ?= --build

.PHONY: help
help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- build
.PHONY: sim
sim: ## Build the Go fleet simulator
	cd simulator && go build -o bin/fleetsim ./cmd/fleetsim

.PHONY: setup
setup: ## Install the Python environment (uv)
	cd platform && uv sync --locked

.PHONY: lambda-package
lambda-package: ## Build the arm64 Lambda zip (platform/dist/lambda.zip)
	cd platform && ./scripts/build_lambda.sh

# ---------------------------------------------------------------- quality
.PHONY: lint
lint: ## Lint + typecheck Go and Python
	cd simulator && gofmt -l . | (! grep .) && go vet ./... && golangci-lint run ./...
	cd platform && uv run ruff format --check src tests && uv run ruff check src tests && uv run mypy

.PHONY: test
test: ## Unit tests (Go race + Python with coverage)
	cd simulator && go test -race -count=1 ./...
	cd platform && uv run pytest --cov

.PHONY: test-integration
test-integration: ## Kafka integration test (needs `make up`)
	cd platform && KAFKA_BOOTSTRAP=localhost:29092 uv run pytest -m integration -q

.PHONY: bench
bench: ## Simulator benchmarks: 1M devices in memory, events/s
	cd simulator && go test -run '^$$' -bench . -benchmem ./...
	cd simulator && go run ./cmd/fleetsim -devices 1000000 -duration 10m -sink discard -progress 0

.PHONY: eval
eval: sim ## Golden-set evaluation gate (fake LLM, deterministic)
	cd platform && uv run fleetintel-eval --golden ../evals/golden.yaml --simulator-bin $(SIM_BIN) \
		--out evals-report.json --markdown evals-report.md

.PHONY: cost-report
cost-report: ## Regenerate docs/cost-report.md from the pricing table
	cd platform && uv run fleetintel-cost report > ../docs/cost-report.md

.PHONY: tf-validate
tf-validate: ## terraform fmt + validate (no credentials needed)
	cd infra/terraform && terraform fmt -check -recursive && terraform init -backend=false -input=false >/dev/null && terraform validate

# ---------------------------------------------------------------- local stack
.PHONY: up
up: ## Start Kafka, moto-server (DynamoDB+SQS), Jaeger and the platform
	docker compose up -d --wait $(UP_FLAGS)

.PHONY: demo
demo: up ## Simulate 100k devices with a cell outage and print incident, enrichment and diagnosis
	docker compose run --rm simulator -devices $(DEMO_DEVICES) -duration 14m -scenario /scenarios/demo.json \
		-sink kafka -kafka-brokers kafka:9092 -progress 0
	docker compose exec -T platform python -m fleetintel.local.demo --api http://127.0.0.1:8080
	@echo "Traces: http://localhost:16686  |  API: curl -H 'x-api-key: demo-key-acme' localhost:8080/v1/incidents"

.PHONY: down
down: ## Stop the local stack and drop its state
	docker compose down -v
