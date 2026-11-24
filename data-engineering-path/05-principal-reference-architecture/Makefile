.PHONY: up down test e2e cost

up:      ## Airflow (http://localhost:8085) + Marquez UI (http://localhost:3002)
	docker compose up -d --build --wait

test:    ## Terraform guardrails (mocked providers) + cost model + lineage DAG tests
	docker compose --profile test run --rm terraform
	docker compose --profile test run --rm --build cost
	docker compose --profile test run --rm --build lineage-tests

e2e: up  ## run the SQL pipeline, then assert Marquez holds the full upstream lineage of the mart
	python3 lineage/scripts/e2e.py revenue_lineage --logical-date 2026-11-18T03:00:00Z
	python3 lineage/scripts/check_lineage.py

cost:    ## print the monthly cost scenarios
	docker compose --profile test run --rm --build cost python estimate.py

down:
	docker compose down -v
