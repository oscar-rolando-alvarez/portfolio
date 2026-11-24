.PHONY: up down test e2e logs

up:      ## start Airflow (UI on http://localhost:8081, user/password from .env, default airflow/airflow)
	docker compose up -d --build --wait

test:    ## lint + unit + DAG tests in the test image (offline)
	docker compose --profile test run --rm --build tests

e2e: up  ## trigger the DAG on the running stack and wait for success
	python3 scripts/e2e.py weather_daily_ingest --logical-date 2026-11-18T02:00:00Z --conf '{"city":"bogota"}'

logs:
	docker compose logs -f airflow-scheduler airflow-dag-processor

down:    ## stop and delete containers and the metadata volume
	docker compose down -v
