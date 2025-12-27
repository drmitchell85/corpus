"""Celery worker tasks for text ingestion."""

from workers.celery_config import app


@app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_text(self, job_id: str, source_type: str, source_url: str = None,
                 pdf_path: str = None, metadata: dict = None):
    """Process a text ingestion job.

    Args:
        job_id: Unique identifier for this job
        source_type: Either "gutenberg" or "pdf"
        source_url: URL to fetch text from (for gutenberg)
        pdf_path: Path to PDF file (for pdf)
        metadata: Dict with author, title, year, genre

    Returns:
        dict: Job result with status and details
    """
    try:
        # TODO: Phase 1.4 - Fetch text (Gutenberg) or extract (PDF)
        # TODO: Phase 1.5 - Chunk text into paragraphs
        # TODO: Phase 1.6 - Embed chunks with sentence-transformers
        # TODO: Phase 1.7 - Store in DuckDB

        return {
            "job_id": job_id,
            "status": "completed",
            "source_type": source_type,
        }

    except Exception as exc:
        # Retry on failure
        raise self.retry(exc=exc)
