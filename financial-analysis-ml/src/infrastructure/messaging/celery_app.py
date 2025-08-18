"""Celery application configuration."""
import os
from celery import Celery
from kombu import Queue

# Create Celery instance
celery_app = Celery("financial_analysis")

# Configuration
celery_app.conf.update(
    # Broker settings
    broker_url=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1"),
    result_backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task routing
    task_routes={
        "financial_analysis.ml.*": {"queue": "ml_tasks"},
        "financial_analysis.data.*": {"queue": "data_tasks"},
        "financial_analysis.notifications.*": {"queue": "notification_tasks"},
    },
    
    # Queue definitions
    task_default_queue="default",
    task_queues=(
        Queue("default", routing_key="default"),
        Queue("ml_tasks", routing_key="ml_tasks"),
        Queue("data_tasks", routing_key="data_tasks"),
        Queue("notification_tasks", routing_key="notification_tasks"),
    ),
    
    # Worker settings
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
    
    # Retry settings
    task_retry_delay=60,
    task_max_retries=3,
    
    # Result settings
    result_expires=3600,  # 1 hour
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
)

# Auto-discover tasks
celery_app.autodiscover_tasks([
    "src.infrastructure.messaging.tasks.ml_tasks",
    "src.infrastructure.messaging.tasks.data_tasks",
    "src.infrastructure.messaging.tasks.notification_tasks",
])


if __name__ == "__main__":
    celery_app.start()