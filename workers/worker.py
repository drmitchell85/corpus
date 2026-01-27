"""Celery worker tasks for text ingestion."""

import logging
import os
import time
import requests

from celery.exceptions import SoftTimeLimitExceeded
from celery.signals import worker_ready
from workers.celery_config import app
from workers.gutenberg import fetch_and_clean
from workers.pdf import extract_and_clean as extract_pdf
from workers.html_extractor import extract_and_clean as extract_html
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
    task_start = time.time()

    logger.info(
        "Task started",
        extra={
            "job_id": job_id,
            "source_type": source_type,
            "source_url": source_url,
            "pdf_path": pdf_path,
            "metadata": metadata,
        }
    )

    try:
        # Step 1: Fetch/extract text
        fetch_start = time.time()
        if source_type == "gutenberg":
            if not source_url:
                raise ValueError("source_url required for gutenberg source_type")
            logger.debug(
                "Fetching Gutenberg text",
                extra={"job_id": job_id, "source_url": source_url}
            )
            text = fetch_and_clean(source_url)
        elif source_type == "pdf":
            if not pdf_path:
                raise ValueError("pdf_path required for pdf source_type")
            logger.debug(
                "Extracting PDF text",
                extra={"job_id": job_id, "pdf_path": pdf_path}
            )
            text = extract_pdf(pdf_path)  # extract_pdf handles file validation
        else:
            raise ValueError(f"Unknown source_type: {source_type}")

        fetch_duration_ms = int((time.time() - fetch_start) * 1000)
        logger.info(
            "Text fetched successfully",
            extra={
                "job_id": job_id,
                "source_type": source_type,
                "text_length": len(text),
                "duration_ms": fetch_duration_ms,
            }
        )

        # Step 2: Chunk text
        chunk_start = time.time()
        logger.debug("Chunking text", extra={"job_id": job_id, "text_length": len(text)})
        chunks = chunk_text(text)
        chunk_duration_ms = int((time.time() - chunk_start) * 1000)

        if not chunks:
            logger.warning(
                "No chunks produced from text",
                extra={
                    "job_id": job_id,
                    "text_length": len(text),
                    "duration_ms": chunk_duration_ms,
                }
            )
            return {
                "job_id": job_id,
                "status": "completed",
                "source_type": source_type,
                "chunks_stored": 0,
                "message": "No chunks produced from text",
            }

        logger.info(
            "Text chunked successfully",
            extra={
                "job_id": job_id,
                "chunk_count": len(chunks),
                "duration_ms": chunk_duration_ms,
            }
        )

        # Step 3: Embed chunks
        embed_start = time.time()
        logger.debug("Embedding chunks", extra={"job_id": job_id, "chunk_count": len(chunks)})
        embeddings = embed_chunks(chunks)
        embed_duration_ms = int((time.time() - embed_start) * 1000)
        logger.info(
            "Chunks embedded successfully",
            extra={
                "job_id": job_id,
                "chunk_count": len(chunks),
                "duration_ms": embed_duration_ms,
            }
        )

        # Step 4: Store in DuckDB
        store_start = time.time()
        logger.debug("Storing chunks in database", extra={"job_id": job_id, "chunk_count": len(chunks)})
        chunk_indices = list(range(len(chunks)))  # 0-based sequential indices
        result = store_chunks(
            chunks=chunks,
            embeddings=embeddings,
            source_url=source_url or pdf_path,
            chunk_indices=chunk_indices,
            author=metadata.get("author"),
            title=metadata.get("title"),
            year=metadata.get("year"),
            genre=metadata.get("genre"),
            job_id=job_id,
        )
        store_duration_ms = int((time.time() - store_start) * 1000)

        task_duration_ms = int((time.time() - task_start) * 1000)
        logger.info(
            "Task completed successfully",
            extra={
                "job_id": job_id,
                "source_type": source_type,
                "chunks_stored": result.stored,
                "chunks_skipped": result.skipped,
                "store_duration_ms": store_duration_ms,
                "total_duration_ms": task_duration_ms,
            }
        )

        return {
            "job_id": job_id,
            "status": "completed",
            "source_type": source_type,
            "chunks_processed": len(chunks),
            "chunks_stored": result.stored,
            "chunks_skipped": result.skipped,
        }

    except (ValueError, FileNotFoundError) as exc:
        # Permanent validation failures - don't retry:
        # - ValueError: Invalid URL, corrupt PDF, bad input
        # - FileNotFoundError: Missing PDF file
        logger.error(
            "Task failed with validation error",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
            }
        )
        raise

    except RuntimeError as exc:
        # Model loading or system failures - include stack trace
        logger.error(
            "Task failed with runtime error",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
            exc_info=True
        )
        raise

    except (requests.exceptions.ConnectionError,
            requests.exceptions.Timeout) as exc:
        # Transient network failures - retry these
        # Note: ConnectTimeout inherits from both ConnectionError and Timeout
        logger.warning(
            "Task failed with network error, retrying",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
                "retry_count": self.request.retries,
            }
        )
        raise self.retry(exc=exc)

    except requests.exceptions.HTTPError as exc:
        # HTTP errors - only retry server errors (5xx), timeouts (408), and rate limits (429)
        if exc.response is not None:
            status = exc.response.status_code
            if status >= 500 or status in (408, 429):
                logger.warning(
                    "Task failed with retryable HTTP error, retrying",
                    extra={
                        "job_id": job_id,
                        "status_code": status,
                        "error": str(exc),
                        "retry_count": self.request.retries,
                    }
                )
                raise self.retry(exc=exc)
        # Other 4xx client errors are permanent - don't retry
        logger.error(
            "Task failed with non-retryable HTTP error",
            extra={
                "job_id": job_id,
                "status_code": exc.response.status_code if exc.response else None,
                "error": str(exc),
            },
            exc_info=True
        )
        raise

    except requests.exceptions.TooManyRedirects as exc:
        # Redirect loop - permanent configuration issue, don't retry
        logger.error(
            "Task failed with redirect loop",
            extra={"job_id": job_id, "error": str(exc)},
            exc_info=True
        )
        raise

    except requests.exceptions.RequestException as exc:
        # Catch any other requests exceptions not explicitly handled above
        # (ChunkedEncodingError, ContentDecodingError, etc.)
        logger.warning(
            "Task failed with unknown requests error, retrying",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
                "retry_count": self.request.retries,
            }
        )
        raise self.retry(exc=exc)

    except SoftTimeLimitExceeded as exc:
        # Task exceeded soft timeout (540s) - retry to allow completion
        # Hard timeout (600s) will kill the task if soft timeout retry also fails
        logger.warning(
            "Task exceeded soft time limit, retrying",
            extra={
                "job_id": job_id,
                "soft_limit_seconds": 540,
                "retry_count": self.request.retries,
            }
        )
        raise self.retry(exc=exc)

    except Exception as exc:
        # Unknown exceptions - log and don't retry to avoid infinite loops
        logger.error(
            "Task failed with unexpected error",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
            exc_info=True
        )
        raise


@app.task(
    bind=True,
    max_retries=_get_max_retries(),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    task_time_limit=600,
    task_soft_time_limit=540,
    acks_late=True,
    task_reject_on_worker_lost=True,
)
def process_html(self, job_id: str, html: str, source_url: str = None, metadata: dict = None):
    """Process HTML content from browser extension or API.

    Pipeline:
    1. Extract text from HTML using Readability
    2. Chunk into paragraphs (100-2000 chars)
    3. Embed each chunk with sentence-transformers
    4. Store chunks + embeddings in DuckDB

    Args:
        job_id: Unique identifier for this job
        html: Raw HTML content
        source_url: URL where HTML was captured from (optional)
        metadata: Dict with author, title, year, genre (optional)
            Note: If metadata["title"] is not provided, will use extracted title from Readability

    Returns:
        dict: Job result with status and details
    """
    # P2-4: Copy metadata dict to avoid mutating caller's dict
    metadata = dict(metadata or {})
    task_start = time.time()

    logger.info(
        "HTML processing task started",
        extra={
            "job_id": job_id,
            "html_length": len(html),
            "source_url": source_url,
            "metadata": metadata,
        }
    )

    try:
        # Step 1: Extract text from HTML
        extract_start = time.time()
        logger.debug(
            "Extracting text from HTML",
            extra={"job_id": job_id, "html_length": len(html)}
        )
        text, extracted_title = extract_html(html, url=source_url)
        extract_duration_ms = int((time.time() - extract_start) * 1000)

        logger.info(
            "HTML extraction successful",
            extra={
                "job_id": job_id,
                "html_length": len(html),
                "text_length": len(text),
                "extracted_title": extracted_title,
                "duration_ms": extract_duration_ms,
            }
        )

        # Use extracted title if not provided in metadata
        if not metadata.get("title") and extracted_title:
            metadata["title"] = extracted_title
            logger.debug(
                "Using extracted title from Readability",
                extra={"job_id": job_id, "title": extracted_title}
            )

        # Step 2: Chunk text
        chunk_start = time.time()
        logger.debug("Chunking text", extra={"job_id": job_id, "text_length": len(text)})
        chunks = chunk_text(text)
        chunk_duration_ms = int((time.time() - chunk_start) * 1000)

        if not chunks:
            logger.warning(
                "No chunks produced from HTML",
                extra={
                    "job_id": job_id,
                    "text_length": len(text),
                    "duration_ms": chunk_duration_ms,
                }
            )
            return {
                "job_id": job_id,
                "status": "completed",
                "source_type": "html",
                "chunks_stored": 0,
                "message": "No chunks produced from HTML",
            }

        logger.info(
            "Text chunked successfully",
            extra={
                "job_id": job_id,
                "chunk_count": len(chunks),
                "duration_ms": chunk_duration_ms,
            }
        )

        # Step 3: Embed chunks
        embed_start = time.time()
        logger.debug("Embedding chunks", extra={"job_id": job_id, "chunk_count": len(chunks)})
        embeddings = embed_chunks(chunks)
        embed_duration_ms = int((time.time() - embed_start) * 1000)
        logger.info(
            "Chunks embedded successfully",
            extra={
                "job_id": job_id,
                "chunk_count": len(chunks),
                "duration_ms": embed_duration_ms,
            }
        )

        # Step 4: Store in DuckDB
        store_start = time.time()
        logger.debug("Storing chunks in database", extra={"job_id": job_id, "chunk_count": len(chunks)})
        chunk_indices = list(range(len(chunks)))
        result = store_chunks(
            chunks=chunks,
            embeddings=embeddings,
            source_url=source_url or f"html-{job_id}",  # Fallback if no URL provided
            chunk_indices=chunk_indices,
            author=metadata.get("author"),
            title=metadata.get("title"),
            year=metadata.get("year"),
            genre=metadata.get("genre"),
            job_id=job_id,
        )
        store_duration_ms = int((time.time() - store_start) * 1000)

        task_duration_ms = int((time.time() - task_start) * 1000)
        logger.info(
            "HTML processing task completed successfully",
            extra={
                "job_id": job_id,
                "chunks_stored": result.stored,
                "chunks_skipped": result.skipped,
                "store_duration_ms": store_duration_ms,
                "total_duration_ms": task_duration_ms,
            }
        )

        return {
            "job_id": job_id,
            "status": "completed",
            "source_type": "html",
            "chunks_processed": len(chunks),
            "chunks_stored": result.stored,
            "chunks_skipped": result.skipped,
            "extracted_title": extracted_title,
        }

    except ValueError as exc:
        # Permanent validation failures - don't retry
        logger.error(
            "HTML processing task failed with validation error",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
            }
        )
        raise

    except RuntimeError as exc:
        # Model loading or system failures
        logger.error(
            "HTML processing task failed with runtime error",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
            exc_info=True
        )
        raise

    except SoftTimeLimitExceeded as exc:
        # Task exceeded soft timeout - retry
        logger.warning(
            "HTML processing task exceeded soft time limit, retrying",
            extra={
                "job_id": job_id,
                "soft_limit_seconds": 540,
                "retry_count": self.request.retries,
            }
        )
        raise self.retry(exc=exc)

    except Exception as exc:
        # Unknown exceptions - log and don't retry
        logger.error(
            "HTML processing task failed with unexpected error",
            extra={
                "job_id": job_id,
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
            exc_info=True
        )
        raise
