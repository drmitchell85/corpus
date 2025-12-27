"""DuckDB schema and database utilities."""

import hashlib
import duckdb
import numpy as np
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "corpus.db"


def get_connection() -> duckdb.DuckDBPyConnection:
    """Get a connection to the DuckDB database."""
    return duckdb.connect(str(DB_PATH))


def init_schema() -> None:
    """Initialize the database schema.

    Creates the texts table with embedding column and indexes.
    Safe to call multiple times (uses IF NOT EXISTS).
    """
    conn = get_connection()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS texts (
            id INTEGER PRIMARY KEY,
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

    conn.close()


def generate_hash(text: str) -> str:
    """Generate a SHA-256 hash of text content.

    Used for duplicate detection - same text produces same hash.

    Args:
        text: Text content to hash

    Returns:
        Hex-encoded SHA-256 hash
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def hash_exists(text_hash: str) -> bool:
    """Check if a text hash already exists in the database.

    Args:
        text_hash: SHA-256 hash to check

    Returns:
        True if hash exists, False otherwise
    """
    conn = get_connection()
    result = conn.execute(
        "SELECT 1 FROM texts WHERE hash = ? LIMIT 1",
        [text_hash]
    ).fetchone()
    conn.close()
    return result is not None


def store_chunk(
    text: str,
    embedding: np.ndarray,
    source_url: str,
    author: str = None,
    title: str = None,
    year: int = None,
    genre: str = None,
) -> str:
    """Store a single text chunk with its embedding.

    Args:
        text: The text chunk
        embedding: 384-dim numpy array
        source_url: URL or path where text was sourced
        author: Author name (optional)
        title: Work title (optional)
        year: Publication year (optional)
        genre: Genre classification (optional)

    Returns:
        Hash of the stored chunk
    """
    text_hash = generate_hash(text)

    conn = get_connection()
    conn.execute(
        """
        INSERT INTO texts (source_url, text, embedding, author, title, year, genre, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (hash) DO NOTHING
        """,
        [source_url, text, embedding.tolist(), author, title, year, genre, text_hash]
    )
    conn.close()

    return text_hash


def store_chunks(
    chunks: list[str],
    embeddings: list[np.ndarray],
    source_url: str,
    author: str = None,
    title: str = None,
    year: int = None,
    genre: str = None,
) -> int:
    """Store multiple text chunks with their embeddings.

    Args:
        chunks: List of text chunks
        embeddings: List of 384-dim numpy arrays
        source_url: URL or path where text was sourced
        author: Author name (optional)
        title: Work title (optional)
        year: Publication year (optional)
        genre: Genre classification (optional)

    Returns:
        Number of chunks stored (excludes duplicates)
    """
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings must have same length")

    conn = get_connection()
    stored_count = 0

    for text, embedding in zip(chunks, embeddings):
        text_hash = generate_hash(text)

        result = conn.execute(
            """
            INSERT INTO texts (source_url, text, embedding, author, title, year, genre, hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (hash) DO NOTHING
            """,
            [source_url, text, embedding.tolist(), author, title, year, genre, text_hash]
        )

        if result.rowcount > 0:
            stored_count += 1

    conn.close()
    return stored_count


if __name__ == "__main__":
    init_schema()
    print(f"Schema initialized at {DB_PATH}")
