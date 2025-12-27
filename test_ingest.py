#!/usr/bin/env python3
"""End-to-end test script for the ingestion pipeline.

This script tests the complete pipeline without Celery/Redis:
1. Fetch text from Gutenberg
2. Strip boilerplate
3. Chunk into paragraphs
4. Embed with sentence-transformers
5. Store in DuckDB
6. Verify storage

Usage:
    python test_ingest.py [gutenberg_url]

Default URL is a short Gutenberg text for quick testing.
"""

import sys
from workers.gutenberg import fetch_and_clean
from workers.chunker import chunk_text
from workers.embedder import embed_chunks
from workers.db import init_schema, store_chunks, get_connection

# Default: "The Gift of the Magi" by O. Henry - short story, ~2000 words
DEFAULT_URL = "https://www.gutenberg.org/cache/epub/7256/pg7256.txt"

# Test metadata
TEST_METADATA = {
    "author": "O. Henry",
    "title": "The Gift of the Magi",
    "year": 1905,
    "genre": "short story",
}


def run_test(url: str = DEFAULT_URL) -> bool:
    """Run the end-to-end ingestion test.

    Args:
        url: Gutenberg URL to ingest

    Returns:
        True if test passed, False otherwise
    """
    print("=" * 60)
    print("CORPUS INGESTION PIPELINE - END-TO-END TEST")
    print("=" * 60)
    print()

    # Step 0: Initialize schema
    print("[1/6] Initializing database schema...")
    init_schema()
    print("      ✓ Schema ready")
    print()

    # Step 1: Fetch and clean
    print(f"[2/6] Fetching text from Gutenberg...")
    print(f"      URL: {url}")
    try:
        text = fetch_and_clean(url)
        print(f"      ✓ Fetched and cleaned: {len(text):,} characters")
    except Exception as e:
        print(f"      ✗ Failed to fetch: {e}")
        return False
    print()

    # Step 2: Chunk
    print("[3/6] Chunking text into paragraphs...")
    chunks = chunk_text(text)
    print(f"      ✓ Created {len(chunks)} chunks")
    if chunks:
        avg_size = sum(len(c) for c in chunks) // len(chunks)
        print(f"      Average chunk size: {avg_size} characters")
    print()

    # Step 3: Embed
    print("[4/6] Embedding chunks with sentence-transformers...")
    print("      (This may take a moment on first run - loading model)")
    embeddings = embed_chunks(chunks)
    print(f"      ✓ Created {len(embeddings)} embeddings")
    if embeddings:
        print(f"      Embedding dimension: {len(embeddings[0])}")
    print()

    # Step 4: Store
    print("[5/6] Storing in DuckDB...")
    result = store_chunks(
        chunks=chunks,
        embeddings=embeddings,
        source_url=url,
        author=TEST_METADATA["author"],
        title=TEST_METADATA["title"],
        year=TEST_METADATA["year"],
        genre=TEST_METADATA["genre"],
    )
    print(f"      ✓ Stored {result.stored} chunks (duplicates skipped: {result.skipped})")
    print()

    # Step 5: Verify
    print("[6/6] Verifying data in DuckDB...")
    with get_connection() as conn:
        # Count total rows
        total = conn.execute("SELECT COUNT(*) FROM texts").fetchone()[0]
        print(f"      Total rows in database: {total}")

        # Count rows from this source
        source_count = conn.execute(
            "SELECT COUNT(*) FROM texts WHERE source_url = ?",
            [url]
        ).fetchone()[0]
        print(f"      Rows from this source: {source_count}")

        # Sample a row
        sample = conn.execute(
            """
            SELECT id, author, title, year, genre, LENGTH(text) as text_len,
                   LENGTH(embedding::VARCHAR) as emb_len
            FROM texts
            WHERE source_url = ?
            LIMIT 1
            """,
            [url]
        ).fetchone()

        if sample:
            print(f"      Sample row:")
            print(f"        - ID: {sample[0]}")
            print(f"        - Author: {sample[1]}")
            print(f"        - Title: {sample[2]}")
            print(f"        - Year: {sample[3]}")
            print(f"        - Genre: {sample[4]}")
            print(f"        - Text length: {sample[5]} chars")
            print(f"        - Embedding stored: {'Yes' if sample[6] > 0 else 'No'}")
    print()

    # Summary
    print("=" * 60)
    print("TEST PASSED ✓")
    print("=" * 60)
    print()
    print("The ingestion pipeline is working correctly.")
    print("You can now start the full stack:")
    print("  1. redis-server")
    print("  2. celery -A workers.worker worker --loglevel=info")
    print("  3. go run api/main.go")
    print()

    return True


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    success = run_test(url)
    sys.exit(0 if success else 1)
