"""Migration script to add chunk_index column to existing texts table.

This migration:
1. Adds the chunk_index column to the texts table
2. Creates an index on (source_url, chunk_index)
3. Does NOT backfill existing data (that will be Phase 7.3)

Run this script to update the schema for existing databases.
"""

import logging
from pathlib import Path

from db import get_connection, DB_PATH

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def migrate() -> None:
    """Add chunk_index column and index to existing texts table."""
    logger.info(f"Starting migration on database: {DB_PATH}")

    with get_connection() as conn:
        try:
            conn.execute("BEGIN TRANSACTION")

            # Check if column already exists (case-insensitive)
            result = conn.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE LOWER(table_name) = ? AND LOWER(column_name) = ?
            """, ['texts', 'chunk_index']).fetchone()

            if result:
                logger.info("chunk_index column already exists, skipping column addition")
            else:
                logger.info("Adding chunk_index column to texts table...")
                conn.execute("ALTER TABLE texts ADD COLUMN chunk_index INTEGER")
                logger.info("✓ chunk_index column added")

            # Check if index already exists (case-insensitive)
            result = conn.execute("""
                SELECT index_name
                FROM duckdb_indexes()
                WHERE LOWER(index_name) = ?
            """, ['idx_source_chunk']).fetchone()

            if result:
                logger.info("idx_source_chunk index already exists, skipping index creation")
            else:
                logger.info("Creating index on (source_url, chunk_index)...")
                conn.execute("CREATE INDEX idx_source_chunk ON texts(source_url, chunk_index)")
                logger.info("✓ idx_source_chunk index created")

            conn.execute("COMMIT")
            logger.info("Migration completed successfully!")

        except Exception as e:
            conn.execute("ROLLBACK")
            logger.error(f"Migration failed: {e}", exc_info=True)
            raise


if __name__ == "__main__":
    migrate()
