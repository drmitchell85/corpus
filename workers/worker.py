"""Celery worker tasks for text ingestion."""

import logging
import os
import requests

from celery.exceptions import SoftTimeLimitExceeded
from celery.signals import worker_ready
from workers.celery_config import app
from workers.gutenberg import fetch_and_clean
from workers.pdf import extract_and_clean as extract_pdf
from workers.chunker import chunk_text
from workers.embedder import embed_chunks
from workers.db import store_chunks, init_schema

logger = logging.getLogger(__name__)


def _get_max_retries() -> int:
    """Parse CELERY_MAX_RETRIES env var with validation.

    Returns:
        Integer for max retries (0-10), defaults to 3 if invalid

    Note:
        Invalid values (non-numeric, negative, >10) log warning and use default/max
    """
    raw = os.getenv("CELERY_MAX_RETRIES", "3")
    try:
        val = int(raw)
        if val < 0:
            logger.warning(f"CELERY_MAX_RETRIES={val} is negative, using default 3")
            return 3
        if val > 10:
            logger.warning(f"CELERY_MAX_RETRIES={val} exceeds max 10, using 10")
            return 10
        return val
    except ValueError:
        logger.warning(f"Invalid CELERY_MAX_RETRIES='{raw}', using default 3")
        return 3


@worker_ready.connect
def on_worker_ready(sender=None, conf=None, **kwargs):
    """Initialize database schema when worker is ready.

    Raises:
        SystemExit: If schema initialization fails (prevents worker from accepting tasks)
    """
    try:
        init_schema()
        logger.info("Database schema initialized")
    except Exception as e:
        logger.critical(f"Failed to initialize schema: {e}", exc_info=True)
        raise SystemExit(1)  # Fail fast - don't accept tasks if DB is unavailable


@app.task(
    bind=True,
    max_retries=_get_max_retries(),
    retry_backoff=True,  # Exponential backoff: 2^retry_num seconds
    retry_backoff_max=600,  # Cap backoff at 10 minutes
    retry_jitter=True,  # Add random jitter to prevent thundering herd
    task_time_limit=600,  # Hard timeout: 10 minutes
    task_soft_time_limit=540,  # Soft timeout: 9 minutes (raises SoftTimeLimitExceeded)
    acks_late=True,  # Acknowledge after task completion (at-least-once delivery)
    task_reject_on_worker_lost=True,  # Requeue task if worker crashes mid-execution
)
def process_text(self, job_id: str, source_type: str, source_url: str = None,
                 pdf_path: str = None, metadata: dict = None):
    """Process a text ingestion job.

    Two-layer retry strategy:
    - HTTP layer (gutenberg.py): 3 retries with 0s/2s/4s backoff (4 total attempts)
    - Celery layer: 3 retries with exponential backoff (1s, 2s, 4s + jitter)
    - Total worst case for network failures: 4 Celery attempts × 4 HTTP attempts = 16 total HTTP requests
    - Total time budget: ~6s (HTTP) × 4 attempts + ~7s (Celery backoff) ≈ 30-35 seconds max

    Pipeline:
    1. Fetch/extract text from source
    2. Chunk into paragraphs (100-2000 chars)
    3. Embed each chunk with sentence-transformers
    4. Store chunks + embeddings in DuckDB

    Args:
        job_id: Unique identifier for this job
        source_type: Either "gutenberg" or "pdf"
        source_url: URL to fetch text from (for gutenberg)
        pdf_path: Path to PDF file (for pdf)
        metadata: Dict with author, title, year, genre

    Returns:
        dict: Job result with status and details
    """
    metadata = metadata or {}

    try:
        # Step 1: Fetch/extract text
        if source_type == "gutenberg":
            if not source_url:
                raise ValueError("source_url required for gutenberg source_type")
            text = fetch_and_clean(source_url)
        elif source_type == "pdf":
            if not pdf_path:
                raise ValueError("pdf_path required for pdf source_type")
            text = extract_pdf(pdf_path)  # extract_pdf handles file validation
        else:
            raise ValueError(f"Unknown source_type: {source_type}")

        # Step 2: Chunk text
        chunks = chunk_text(text)

        if not chunks:
            return {
                "job_id": job_id,
                "status": "completed",
                "source_type": source_type,
                "chunks_stored": 0,
                "message": "No chunks produced from text",
            }

        # Step 3: Embed chunks
        embeddings = embed_chunks(chunks)

        # Step 4: Store in DuckDB
        result = store_chunks(
            chunks=chunks,
            embeddings=embeddings,
            source_url=source_url or pdf_path,
            author=metadata.get("author"),
            title=metadata.get("title"),
            year=metadata.get("year"),
            genre=metadata.get("genre"),
        )

        return {
            "job_id": job_id,
            "status": "completed",
            "source_type": source_type,
            "chunks_processed": len(chunks),
            "chunks_stored": result.stored,
            "chunks_skipped": result.skipped,
        }

    except (ValueError, FileNotFoundError, RuntimeError):
        # Permanent failures - don't retry:
        # - ValueError: Invalid URL, corrupt PDF, bad input
        # - FileNotFoundError: Missing PDF file
        # - RuntimeError: Model loading failure
        raise

    except (requests.exceptions.ConnectionError,
            requests.exceptions.Timeout) as exc:
        # Transient network failures - retry these
        # Note: ConnectTimeout inherits from both ConnectionError and Timeout
        raise self.retry(exc=exc)

    except requests.exceptions.HTTPError as exc:
        # HTTP errors - only retry server errors (5xx), timeouts (408), and rate limits (429)
        if exc.response is not None:
            status = exc.response.status_code
            if status >= 500 or status in (408, 429):
                raise self.retry(exc=exc)
        # Other 4xx client errors are permanent - don't retry
        raise

    except requests.exceptions.TooManyRedirects as exc:
        # Redirect loop - permanent configuration issue, don't retry
        logger.warning(f"Redirect loop detected for job {job_id}: {exc}")
        raise

    except requests.exceptions.RequestException as exc:
        # Catch any other requests exceptions not explicitly handled above
        # (ChunkedEncodingError, ContentDecodingError, etc.)
        logger.warning(f"Unhandled requests exception in job {job_id}: {exc}")
        raise self.retry(exc=exc)

    except SoftTimeLimitExceeded as exc:
        # Task exceeded soft timeout (540s) - retry to allow completion
        # Hard timeout (600s) will kill the task if soft timeout retry also fails
        logger.warning(f"Job {job_id} exceeded soft time limit (540s), retrying...")
        raise self.retry(exc=exc)

    except Exception as exc:
        # Unknown exceptions - log and don't retry to avoid infinite loops
        logger.error(f"Unexpected error in job {job_id}: {exc}", exc_info=True)
        raise
