"""DuckDB schema and database utilities."""

import hashlib
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator

import duckdb
import numpy as np
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "corpus.db"


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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                hash VARCHAR UNIQUE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_year ON texts(year)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_genre ON texts(genre)")


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
    author: str = None,
    title: str = None,
    year: int = None,
    genre: str = None,
) -> bool:
    """Insert a single text chunk into the database.

    Args:
        conn: Database connection (caller manages lifecycle)
        text: The text chunk
        embedding: 384-dim numpy array
        source_url: URL or path where text was sourced
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
        INSERT INTO texts (source_url, text, embedding, author, title, year, genre, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [source_url, text, embedding.tolist(), author, title, year, genre, text_hash]
    )
    return True


def store_chunks(
    chunks: list[str],
    embeddings: list[np.ndarray],
    source_url: str,
    author: str = None,
    title: str = None,
    year: int = None,
    genre: str = None,
) -> StoreResult:
    """Store multiple text chunks with their embeddings.

    Runs as a single transaction — all chunks are stored or none are.

    Args:
        chunks: List of text chunks
        embeddings: List of 384-dim numpy arrays
        source_url: URL or path where text was sourced
        author: Author name (optional)
        title: Work title (optional)
        year: Publication year (optional)
        genre: Genre classification (optional)

    Returns:
        StoreResult with stored and skipped counts

    Raises:
        ValueError: If chunks and embeddings have different lengths
        DatabaseError: If the transaction fails
    """
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings must have same length")

    with get_connection() as conn:
        try:
            conn.execute("BEGIN TRANSACTION")
            stored = 0

            for text, embedding in zip(chunks, embeddings):
                if insert_chunk(conn, text, embedding, source_url, author, title, year, genre):
                    stored += 1

            conn.execute("COMMIT")
            return StoreResult(stored=stored, skipped=len(chunks) - stored)

        except Exception as e:
            conn.execute("ROLLBACK")
            raise DatabaseError(f"Failed to store chunks: {e}") from e


if __name__ == "__main__":
    init_schema()
    print(f"Schema initialized at {DB_PATH}")
