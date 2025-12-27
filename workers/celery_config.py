"""Celery configuration with Redis broker."""

from celery import Celery

# Redis connection URL (default to localhost)
REDIS_URL = "redis://localhost:6379/0"

# Create Celery app
app = Celery(
    "corpus_workers",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["workers.worker"],
)

# Celery configuration
app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task result expiration (1 hour)
    result_expires=3600,

    # Retry settings for broker connection
    broker_connection_retry_on_startup=True,
)
