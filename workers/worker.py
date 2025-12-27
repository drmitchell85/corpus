"""Celery worker tasks for text ingestion."""

from workers.celery_config import app
from workers.gutenberg import fetch_and_clean
from workers.chunker import chunk_text
from workers.embedder import embed_chunks
from workers.db import store_chunks, init_schema


# Ensure schema exists on worker startup
init_schema()


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
            # PDF extraction will be implemented in Phase 3
            raise NotImplementedError("PDF extraction not yet implemented")
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

    except NotImplementedError:
        # Don't retry unimplemented features
        raise

    except Exception as exc:
        # Retry on transient failures (network, etc.)
        raise self.retry(exc=exc)
