"""DuckDB schema and database utilities."""

import duckdb
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


if __name__ == "__main__":
    init_schema()
    print(f"Schema initialized at {DB_PATH}")
