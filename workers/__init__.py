"""Workers package initialization with structured logging setup."""

import logging
import os
import sys
from pythonjsonlogger import jsonlogger


def setup_logging():
    """Configure structured JSON logging for all workers.

    Features:
    - JSON format for machine-readable logs
    - Configurable log level via LOG_LEVEL env var (DEBUG, INFO, WARN, ERROR)
    - Includes task_id, timestamp, level, logger name, message
    - All logs go to stdout (captured by container orchestration)

    Call this once at worker startup before any logging occurs.
    """
    log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()

    # Map string to logging constant
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARN": logging.WARNING,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }

    log_level = level_map.get(log_level_str, logging.INFO)
    invalid_log_level = log_level_str not in level_map

    # Create JSON formatter with standard fields
    # Format: {"timestamp": "...", "level": "INFO", "name": "workers.db", "message": "...", ...custom fields...}
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers to avoid duplication
    root_logger.handlers.clear()

    # Add stdout handler with JSON formatter
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Suppress noisy third-party loggers
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
    logging.getLogger("transformers").setLevel(logging.WARNING)
    logging.getLogger("torch").setLevel(logging.WARNING)

    # Log warning if LOG_LEVEL was invalid (now that JSON logging is configured)
    if invalid_log_level:
        logging.getLogger(__name__).warning(
            f"Invalid LOG_LEVEL='{log_level_str}', using INFO",
            extra={"provided_level": log_level_str, "fallback_level": "INFO"}
        )


# Auto-configure logging when package is imported
setup_logging()
