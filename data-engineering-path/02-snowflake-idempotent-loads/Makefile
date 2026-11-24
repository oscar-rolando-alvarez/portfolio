.PHONY: up down test e2e logs query

up:      ## start Airflow (UI on http://localhost:8082, default login airflow/airflow)
	docker compose up -d --build --wait

test:    ## lint + unit + DuckDB idempotency + dag.test(), offline
	docker compose --profile test run --rm --build tests

e2e: up  ## loader defers until the extract lands, loads, then reruns: counts must not change
	python3 scripts/e2e.py ecommerce_daily_load --logical-date 2026-11-14T02:00:00Z --until-deferred wait_for_extract
	python3 scripts/e2e.py ecommerce_source_simulator --logical-date 2026-11-14T01:00:00Z
	python3 scripts/e2e.py ecommerce_daily_load --logical-date 2026-11-14T02:00:00Z
	python3 scripts/e2e.py ecommerce_daily_load --logical-date 2026-11-14T02:00:00Z --rerun
	$(MAKE) query SQL="SELECT _batch_date, COUNT(*) AS orders FROM raw.orders GROUP BY ALL ORDER BY 1"

query:   ## make query SQL="SELECT ..."
	docker compose exec airflow-scheduler python /opt/airflow/scripts/query.py "$(SQL)"

logs:
	docker compose logs -f airflow-scheduler airflow-triggerer

down:
	docker compose down -v
