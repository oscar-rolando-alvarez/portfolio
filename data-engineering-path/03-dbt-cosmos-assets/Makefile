.PHONY: up down test e2e logs query

up:      ## start Airflow (UI on http://localhost:8083, default login airflow/airflow)
	docker compose up -d --build --wait

test:    ## lint + DAG integrity + real dbt build + dag.test() of the three DAGs, offline
	docker compose --profile test run --rm --build tests

e2e: up  ## trigger ingestion only; Assets trigger dbt, then the report
	python3 scripts/e2e.py shop_dbt_transform --unpause-only
	python3 scripts/e2e.py revenue_report --unpause-only
	python3 scripts/e2e.py shop_raw_ingest --logical-date 2026-11-18T02:00:00Z
	python3 scripts/e2e.py shop_dbt_transform --await-triggered --timeout 900
	python3 scripts/e2e.py revenue_report --await-triggered
	@echo "--- data/reports/daily_revenue_latest.csv"; cat data/reports/daily_revenue_latest.csv

query:   ## make query SQL="SELECT ..."
	docker compose exec airflow-scheduler python /opt/airflow/scripts/query.py "$(SQL)"

logs:
	docker compose logs -f airflow-scheduler

down:
	docker compose down -v
