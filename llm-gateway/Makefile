SHELL := /bin/bash
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
REDIS_URL ?= redis://localhost:6379/0

.PHONY: help run build test test-integration lint fmt vuln evals bench loadtest docker up down helm

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-18s %s\n", $$1, $$2}'

run: ## Run the gateway locally with the offline demo config
	go run ./cmd/gateway -config configs/gateway.yaml

build: ## Build the binary into bin/
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$(VERSION)" -o bin/gateway ./cmd/gateway

test: ## Unit + e2e tests with the race detector (in-memory stores / miniredis)
	go test -race -count=1 ./...

test-integration: ## Same suite against a real Redis (REDIS_URL)
	REDIS_URL=$(REDIS_URL) go test -race -count=1 ./...

lint: ## golangci-lint (includes gofmt/goimports)
	golangci-lint run ./...

fmt: ## Format code
	golangci-lint fmt ./...

vuln: ## Dependency vulnerability audit
	govulncheck ./...

evals: ## Offline eval harness with threshold gate
	go run ./cmd/evals -out evals-report.json

bench: ## Micro-benchmarks
	go test -run '^$$' -bench . -benchmem ./...

loadtest: ## k6 load test against a running gateway (BASE_URL, default localhost:8080)
	docker run --rm -i --network host -e BASE_URL=$${BASE_URL:-http://localhost:8080} -v $(PWD)/loadtest:/scripts grafana/k6:1.8.2 run /scripts/k6.js

docker: ## Build the container image
	docker build --build-arg VERSION=$(VERSION) -t llm-gateway:$(VERSION) .

up: ## Start the full local stack
	docker compose up --build -d

down: ## Stop the local stack
	docker compose down -v

helm: ## Lint and render the Helm chart
	helm lint deploy/helm/llm-gateway --strict
	helm template llm-gateway deploy/helm/llm-gateway > /dev/null
