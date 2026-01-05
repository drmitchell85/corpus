"""Migration script to backfill chunk_index for existing chunks.

This migration assigns chunk_index values to existing chunks that have NULL indices.
The index is assigned as 0-based sequential within each source_url, ordered by id ASC
(which preserves the original insertion order).

Run this script after migrate_add_chunk_index.py has been run.
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
    """Backfill chunk_index for existing chunks with NULL indices."""
    logger.info(f"Starting backfill migration on database: {DB_PATH}")

    with get_connection() as conn:
        try:
            conn.execute("BEGIN TRANSACTION")

            # Check how many chunks need backfilling
            result = conn.execute("""
                SELECT COUNT(*) as count
                FROM texts
                WHERE chunk_index IS NULL
            """).fetchone()

            null_count = result[0] if result else 0
            logger.info(f"Found {null_count} chunks with NULL chunk_index")

            if null_count == 0:
                logger.info("No chunks need backfilling, skipping migration")
                conn.execute("COMMIT")
                return

            # Check for sources with mixed NULL/non-NULL chunk_index (edge case)
            # This can happen if some chunks were indexed (Phase 7.2) while others weren't
            mixed_sources = conn.execute("""
                SELECT source_url,
                    COUNT(*) FILTER (WHERE chunk_index IS NULL) as null_count,
                    COUNT(*) FILTER (WHERE chunk_index IS NOT NULL) as non_null_count
                FROM texts
                GROUP BY source_url
                HAVING COUNT(*) FILTER (WHERE chunk_index IS NULL) > 0
                   AND COUNT(*) FILTER (WHERE chunk_index IS NOT NULL) > 0
            """).fetchall()

            if mixed_sources:
                logger.error("Found sources with mixed NULL/non-NULL chunk_index:")
                for source_url, null_ct, non_null_ct in mixed_sources:
                    logger.error(f"  {source_url}: {null_ct} NULL, {non_null_ct} non-NULL")
                raise ValueError(
                    "Cannot backfill mixed-state sources. "
                    "This indicates partial migration or concurrent writes. "
                    "Please ensure all chunks for a source are either all NULL or all indexed."
                )

            # Get distinct source URLs that have NULL chunk_index (for reporting)
            sources = conn.execute("""
                SELECT DISTINCT source_url
                FROM texts
                WHERE chunk_index IS NULL
                ORDER BY source_url
            """).fetchall()

            logger.info(f"Backfilling {null_count} chunks across {len(sources)} sources...")

            # Use DuckDB's ROW_NUMBER() window function with PARTITION BY to assign indices
            # Process all sources in a single UPDATE for efficiency
            # ROW_NUMBER() - 1 gives us 0-based indexing
            # PARTITION BY source_url ensures each source gets its own 0-based sequence
            conn.execute("""
                UPDATE texts
                SET chunk_index = subquery.new_index
                FROM (
                    SELECT id, (ROW_NUMBER() OVER (PARTITION BY source_url ORDER BY id ASC) - 1) AS new_index
                    FROM texts
                    WHERE chunk_index IS NULL
                ) AS subquery
                WHERE texts.id = subquery.id
            """)

            logger.info(f"Backfilled chunk_index for {null_count} chunks")

            # Verify the migration
            logger.info("Verifying migration...")

            # Check that no NULL chunk_index remains
            remaining_nulls = conn.execute("""
                SELECT COUNT(*)
                FROM texts
                WHERE chunk_index IS NULL
            """).fetchone()[0]

            if remaining_nulls > 0:
                raise ValueError(f"Migration incomplete: {remaining_nulls} chunks still have NULL chunk_index")

            # Check that all sources have 0-based sequential indices
            # For each source, verify indices start at 0 and increment by 1
            validation_failures = conn.execute("""
                WITH source_stats AS (
                    SELECT
                        source_url,
                        MIN(chunk_index) as min_idx,
                        MAX(chunk_index) as max_idx,
                        COUNT(*) as chunk_count
                    FROM texts
                    GROUP BY source_url
                )
                SELECT source_url, min_idx, max_idx, chunk_count
                FROM source_stats
                WHERE min_idx != 0 OR max_idx != (chunk_count - 1)
            """).fetchall()

            if validation_failures:
                logger.error("Validation failed for the following sources:")
                for source_url, min_idx, max_idx, count in validation_failures:
                    logger.error(f"  {source_url}: min={min_idx}, max={max_idx}, count={count}")
                raise ValueError("Migration validation failed: indices are not sequential")

            logger.info("✓ Verification passed: all chunks have sequential 0-based indices")

            conn.execute("COMMIT")
            logger.info("Backfill migration completed successfully!")

        except Exception as e:
            conn.execute("ROLLBACK")
            logger.error(f"Migration failed: {e}", exc_info=True)
            raise


if __name__ == "__main__":
    migrate()
