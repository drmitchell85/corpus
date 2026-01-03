"""Celery worker tasks for text ingestion."""

import logging
import os
import requests

from celery.signals import worker_ready
from workers.celery_config import app
from workers.gutenberg import fetch_and_clean
from workers.pdf import extract_and_clean as extract_pdf
from workers.chunker import chunk_text
from workers.embedder import embed_chunks
from workers.db import store_chunks, init_schema

logger = logging.getLogger(__name__)


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


@app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_text(self, job_id: str, source_type: str, source_url: str = None,
                 pdf_path: str = None, metadata: dict = None):
    """Process a text ingestion job.

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

    except requests.exceptions.RequestException as exc:
        # Catch any other requests exceptions not explicitly handled above
        # (TooManyRedirects, ChunkedEncodingError, ContentDecodingError, etc.)
        logger.warning(f"Unhandled requests exception in job {job_id}: {exc}")
        raise self.retry(exc=exc)

    except Exception as exc:
        # Unknown exceptions - log and don't retry to avoid infinite loops
        logger.error(f"Unexpected error in job {job_id}: {exc}", exc_info=True)
        raise
