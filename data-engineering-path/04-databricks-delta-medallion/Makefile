.PHONY: up down test e2e logs sql

up:      ## Airflow on http://localhost:8084 + databricks-local on http://localhost:8090
	docker compose up -d --build --wait

test:    ## Airflow DAG/payload tests + Spark/Delta job tests + emulator contract tests
	docker compose --profile test run --rm --build tests
	docker compose --profile test run --rm --build tests-spark

e2e: up  ## run 16 and 17 Nov (17 carries late events for 16), rerun 17, show gold
	python3 scripts/e2e.py clickstream_medallion --logical-date 2026-11-17T02:30:00Z --timeout 900
	python3 scripts/e2e.py clickstream_medallion --logical-date 2026-11-18T02:30:00Z --timeout 900
	python3 scripts/e2e.py clickstream_medallion --logical-date 2026-11-18T02:30:00Z --rerun --timeout 900
	$(MAKE) sql Q="SELECT event_date, daily_active_users, sessions, purchases, revenue_usd, conversion_rate FROM gold_daily_metrics ORDER BY event_date"

sql:     ## make sql Q="SELECT * FROM silver_events_quarantine LIMIT 5"  (views: <layer>_<table>)
	docker compose exec -e LAKE_ROOT=/lake databricks-local python /workspace/jobs/sql.py "$(Q)"

logs:
	docker compose logs -f databricks-local airflow-triggerer

down:
	docker compose down -v
