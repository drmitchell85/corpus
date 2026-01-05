"""DuckDB schema and database utilities."""

import hashlib
import logging
import os
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Generator

import duckdb
import numpy as np
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")

DB_PATH = Path(os.getenv("DATABASE_PATH", "./corpus.db"))


class DatabaseError(Exception):
    """Raised when a database operation fails."""
    pass


@dataclass
class StoreResult:
    """Result of a chunk storage operation."""
    stored: int
    skipped: int

    @property
    def total(self) -> int:
        return self.stored + self.skipped


@contextmanager
def get_connection() -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """Get a connection to the DuckDB database.

    Use as a context manager to ensure proper cleanup:
        with get_connection() as conn:
            conn.execute(...)
    """
    conn = duckdb.connect(str(DB_PATH))
    try:
        yield conn
    finally:
        conn.close()


def init_schema() -> None:
    """Initialize the database schema.

    Creates the texts table with embedding column and indexes.
    Safe to call multiple times (uses IF NOT EXISTS).
    """
    with get_connection() as conn:
        conn.execute("CREATE SEQUENCE IF NOT EXISTS texts_id_seq START 1")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS texts (
                id INTEGER PRIMARY KEY DEFAULT nextval('texts_id_seq'),
                source_url VARCHAR,
                text VARCHAR,
                embedding FLOAT4[384],
                author VARCHAR,
                title VARCHAR,
                year INTEGER,
                genre VARCHAR,
                chunk_index INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                hash VARCHAR UNIQUE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_year ON texts(year)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_genre ON texts(genre)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_source_chunk ON texts(source_url, chunk_index)")


def generate_hash(text: str) -> str:
    """Generate a SHA-256 hash of text content.

    Used for duplicate detection - same text produces same hash.

    Args:
        text: Text content to hash

    Returns:
        Hex-encoded SHA-256 hash
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def hash_exists(conn: duckdb.DuckDBPyConnection, text_hash: str) -> bool:
    """Check if a text hash already exists in the database.

    Args:
        conn: Database connection
        text_hash: SHA-256 hash to check

    Returns:
        True if hash exists, False otherwise
    """
    result = conn.execute(
        "SELECT 1 FROM texts WHERE hash = ? LIMIT 1",
        [text_hash]
    ).fetchone()
    return result is not None


def insert_chunk(
    conn: duckdb.DuckDBPyConnection,
    text: str,
    embedding: np.ndarray,
    source_url: str,
    chunk_index: int | None = None,
    author: str | None = None,
    title: str | None = None,
    year: int | None = None,
    genre: str | None = None,
) -> bool:
    """Insert a single text chunk into the database.

    Args:
        conn: Database connection (caller manages lifecycle)
        text: The text chunk
        embedding: 384-dim numpy array
        source_url: URL or path where text was sourced
        chunk_index: 0-based position of chunk within source (optional)
        author: Author name (optional)
        title: Work title (optional)
        year: Publication year (optional)
        genre: Genre classification (optional)

    Returns:
        True if chunk was inserted, False if it was a duplicate
    """
    text_hash = generate_hash(text)

    # Check for duplicate before inserting (DuckDB rowcount is unreliable)
    if hash_exists(conn, text_hash):
        return False

    conn.execute(
        """
        INSERT INTO texts (source_url, text, embedding, author, title, year, genre, chunk_index, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [source_url, text, embedding.tolist(), author, title, year, genre, chunk_index, text_hash]
    )
    return True


def store_chunks(
    chunks: list[str],
    embeddings: list[np.ndarray],
    source_url: str,
    chunk_indices: list[int] | None = None,
    author: str | None = None,
    title: str | None = None,
    year: int | None = None,
    genre: str | None = None,
    job_id: str | None = None,
) -> StoreResult:
    """Store multiple text chunks with their embeddings.

    Runs as a single transaction — all chunks are stored or none are.

    Args:
        chunks: List of text chunks
        embeddings: List of 384-dim numpy arrays
        source_url: URL or path where text was sourced
        chunk_indices: List of 0-based indices (optional, must match chunk count if provided)
        author: Author name (optional)
        title: Work title (optional)
        year: Publication year (optional)
        genre: Genre classification (optional)

    Returns:
        StoreResult with stored and skipped counts

    Raises:
        ValueError: If chunks and embeddings have different lengths, or if chunk_indices length mismatches
        DatabaseError: If the transaction fails
    """
    if len(chunks) != len(embeddings):
        logger.error(
            "Chunk and embedding count mismatch",
            extra={
                "job_id": job_id,
                "chunk_count": len(chunks),
                "embedding_count": len(embeddings),
            }
        )
        raise ValueError("chunks and embeddings must have same length")

    if chunk_indices is not None and len(chunk_indices) != len(chunks):
        logger.error(
            "Chunk indices count mismatch",
            extra={
                "job_id": job_id,
                "chunk_count": len(chunks),
                "indices_count": len(chunk_indices),
            }
        )
        raise ValueError("chunk_indices must have same length as chunks")

    start_time = time.time()
    logger.debug(
        "Starting database transaction",
        extra={
            "job_id": job_id,
            "chunk_count": len(chunks),
            "source_url": source_url,
            "author": author,
            "title": title,
            "year": year,
            "genre": genre,
        }
    )

    with get_connection() as conn:
        try:
            conn.execute("BEGIN TRANSACTION")
            stored = 0
            skipped = 0

            for i, (text, embedding) in enumerate(zip(chunks, embeddings)):
                chunk_index = chunk_indices[i] if (chunk_indices and i < len(chunk_indices)) else None
                if insert_chunk(conn, text, embedding, source_url, chunk_index, author, title, year, genre):
                    stored += 1
                else:
                    skipped += 1

            conn.execute("COMMIT")
            duration_ms = int((time.time() - start_time) * 1000)

            logger.info(
                "Database transaction completed",
                extra={
                    "job_id": job_id,
                    "total_chunks": len(chunks),
                    "stored": stored,
                    "skipped": skipped,
                    "source_url": source_url,
                    "duration_ms": duration_ms,
                }
            )

            return StoreResult(stored=stored, skipped=skipped)

        except Exception as e:
            conn.execute("ROLLBACK")
            duration_ms = int((time.time() - start_time) * 1000)

            logger.error(
                "Database transaction failed",
                extra={
                    "job_id": job_id,
                    "chunk_count": len(chunks),
                    "source_url": source_url,
                    "error": str(e),
                    "duration_ms": duration_ms,
                },
                exc_info=True
            )
            raise DatabaseError(f"Failed to store chunks: {e}") from e


if __name__ == "__main__":
    init_schema()
    print(f"Schema initialized at {DB_PATH}")
