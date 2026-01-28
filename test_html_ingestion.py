#!/usr/bin/env python3
"""Integration test for HTML ingestion endpoint.

This script tests the complete HTML ingestion pipeline:
1. POST HTML to /ingest/html endpoint
2. Worker processes HTML (extract → chunk → embed → store)
3. Verify chunks are stored in DuckDB with correct metadata

Requirements:
- API server running on port 8080
- Redis running (for Celery queue)
- Celery worker running
- Embedding service running on port 8001

Usage:
    python test_html_ingestion.py
"""

import json
import time
import requests
from workers.db import get_connection, init_schema

# Test HTML content with realistic article structure
TEST_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Test Article: HTML Ingestion</title>
    <style>body { color: red; }</style>
    <script>console.log('should be removed');</script>
</head>
<body>
    <nav>Navigation menu (should be removed)</nav>
    <article>
        <h1>Test Article: HTML Ingestion</h1>
        <p>This is the first paragraph of test content. It contains enough text
        to be meaningful for chunking and embedding purposes.</p>

        <p>This is the second paragraph with some <strong>HTML formatting</strong>
        and <a href="/link">hyperlinks</a> that should be stripped out during
        extraction.</p>

        <p>The third paragraph includes HTML entities like &amp; ampersand,
        &lt; less than, and &quot;quotes&quot; which should be decoded properly.</p>

        <div>
            <p>A fourth paragraph nested in a div element to test block-level
            tag handling and proper paragraph break insertion.</p>
        </div>
    </article>
    <aside>Advertisement (should be removed)</aside>
    <footer>Footer content</footer>
</body>
</html>
"""

TEST_METADATA = {
    "author": "Test Author",
    "title": "Custom Title Override",
    "year": 2026,
    "genre": "test",
}

API_BASE_URL = "http://localhost:8080"


def test_html_ingestion():
    """Run the HTML ingestion integration test."""
    print("=" * 70)
    print("HTML INGESTION INTEGRATION TEST")
    print("=" * 70)
    print()

    # Step 0: Initialize schema
    print("[1/5] Initializing database schema...")
    init_schema()
    print("      ✓ Schema ready")
    print()

    # Step 1: POST HTML to /ingest/html
    print("[2/5] Posting HTML to /ingest/html endpoint...")
    print(f"      HTML length: {len(TEST_HTML)} bytes")
    print(f"      Metadata: {TEST_METADATA}")

    try:
        response = requests.post(
            f"{API_BASE_URL}/ingest/html",
            json={
                "html": TEST_HTML,
                "url": "https://example.com/test-article",
                "metadata": TEST_METADATA,
            },
            timeout=10,
        )
        response.raise_for_status()
        result = response.json()

        job_id = result.get("job_id")
        status = result.get("status")

        print(f"      ✓ Job queued successfully")
        print(f"      Job ID: {job_id}")
        print(f"      Status: {status}")

    except requests.RequestException as e:
        print(f"      ✗ Failed to post HTML: {e}")
        print()
        print("Make sure the API server is running:")
        print("  cd api && go run cmd/main.go")
        return False
    print()

    # Step 2: Poll job status
    print("[3/5] Polling job status...")
    max_attempts = 60  # 30 seconds timeout (500ms intervals)
    attempt = 0

    while attempt < max_attempts:
        try:
            response = requests.get(
                f"{API_BASE_URL}/ingest/status/{job_id}",
                timeout=5,
            )
            response.raise_for_status()
            status_result = response.json()

            job_status = status_result.get("status")

            if job_status == "SUCCESS":
                print(f"      ✓ Job completed successfully")
                task_result = status_result.get("result", {})
                print(f"      Result: {json.dumps(task_result, indent=8)}")
                break
            elif job_status == "FAILURE":
                print(f"      ✗ Job failed")
                print(f"      Result: {status_result}")
                return False
            else:
                # Still pending or running
                attempt += 1
                time.sleep(0.5)

        except requests.RequestException as e:
            print(f"      ✗ Failed to check status: {e}")
            return False
    else:
        print(f"      ✗ Job did not complete within timeout")
        return False
    print()

    # Step 3: Verify data in DuckDB
    print("[4/5] Verifying chunks stored in DuckDB...")
    source_url = "https://example.com/test-article"

    with get_connection() as conn:
        # Count chunks from this source
        chunks = conn.execute(
            "SELECT COUNT(*) FROM texts WHERE source_url = ?",
            [source_url]
        ).fetchone()[0]

        if chunks == 0:
            print(f"      ✗ No chunks found for source URL: {source_url}")
            return False

        print(f"      ✓ Found {chunks} chunks for source URL")

        # Verify metadata
        sample = conn.execute(
            """
            SELECT id, text, author, title, year, genre,
                   LENGTH(text) as text_len,
                   LENGTH(embedding::VARCHAR) as emb_len,
                   chunk_index
            FROM texts
            WHERE source_url = ?
            ORDER BY chunk_index
            LIMIT 1
            """,
            [source_url]
        ).fetchone()

        if not sample:
            print(f"      ✗ Could not retrieve sample chunk")
            return False

        print(f"      Sample chunk (first):")
        print(f"        - ID: {sample[0]}")
        print(f"        - Text preview: {sample[1][:80]}...")
        print(f"        - Author: {sample[2]}")
        print(f"        - Title: {sample[3]}")
        print(f"        - Year: {sample[4]}")
        print(f"        - Genre: {sample[5]}")
        print(f"        - Text length: {sample[6]} chars")
        print(f"        - Embedding stored: {'Yes' if sample[7] > 0 else 'No'}")
        print(f"        - Chunk index: {sample[8]}")

        # Verify metadata matches what we sent
        if sample[2] != TEST_METADATA["author"]:
            print(f"      ✗ Author mismatch: expected '{TEST_METADATA['author']}', got '{sample[2]}'")
            return False
        if sample[3] != TEST_METADATA["title"]:
            print(f"      ✗ Title mismatch: expected '{TEST_METADATA['title']}', got '{sample[3]}'")
            return False
        if sample[4] != TEST_METADATA["year"]:
            print(f"      ✗ Year mismatch: expected {TEST_METADATA['year']}, got {sample[4]}")
            return False
        if sample[5] != TEST_METADATA["genre"]:
            print(f"      ✗ Genre mismatch: expected '{TEST_METADATA['genre']}', got '{sample[5]}'")
            return False

        print(f"      ✓ Metadata matches expected values")

        # Verify text extraction worked (should not contain HTML tags or entities)
        all_chunks = conn.execute(
            "SELECT text FROM texts WHERE source_url = ? ORDER BY chunk_index",
            [source_url]
        ).fetchall()

        combined_text = " ".join(chunk[0] for chunk in all_chunks)

        # Check for HTML artifacts that should have been removed
        if "<" in combined_text or ">" in combined_text:
            print(f"      ⚠ Warning: HTML tags may not have been fully removed")
        if "&amp;" in combined_text or "&lt;" in combined_text or "&quot;" in combined_text:
            print(f"      ⚠ Warning: HTML entities may not have been decoded")
        if "should be removed" in combined_text.lower():
            print(f"      ⚠ Warning: Boilerplate content may not have been removed")
        else:
            print(f"      ✓ Boilerplate removal successful")

        # Check for expected content
        if "first paragraph" not in combined_text:
            print(f"      ⚠ Warning: Expected content may be missing")
        else:
            print(f"      ✓ Expected content found in extracted text")
    print()

    # Step 4: Summary
    print("[5/5] Test summary...")
    print("      ✓ HTML posted successfully")
    print("      ✓ Worker processed job")
    print("      ✓ Chunks stored in DuckDB")
    print("      ✓ Metadata preserved correctly")
    print()

    print("=" * 70)
    print("INTEGRATION TEST PASSED ✓")
    print("=" * 70)
    print()
    print("The HTML ingestion pipeline is working correctly.")
    print()

    return True


def test_html_size_limit():
    """Test that HTML size limit is enforced."""
    print("=" * 70)
    print("HTML SIZE LIMIT TEST")
    print("=" * 70)
    print()

    print("Testing HTML size limit enforcement...")

    # Create HTML larger than 10MB limit
    large_html = "<html><body>" + ("x" * (11 * 1024 * 1024)) + "</body></html>"

    try:
        response = requests.post(
            f"{API_BASE_URL}/ingest/html",
            json={"html": large_html},
            timeout=10,
        )

        if response.status_code == 400:
            result = response.json()
            if "too large" in result.get("message", "").lower():
                print(f"      ✓ Size limit enforced correctly (HTTP {response.status_code})")
                print(f"      Message: {result.get('message')}")
                print()
                return True

        print(f"      ✗ Unexpected response: {response.status_code}")
        print(f"      Body: {response.text}")
        return False

    except requests.RequestException as e:
        print(f"      ✗ Request failed: {e}")
        return False


def test_empty_html():
    """Test that empty HTML is rejected."""
    print("=" * 70)
    print("EMPTY HTML TEST")
    print("=" * 70)
    print()

    print("Testing empty HTML rejection...")

    try:
        response = requests.post(
            f"{API_BASE_URL}/ingest/html",
            json={"html": ""},
            timeout=10,
        )

        if response.status_code == 400:
            result = response.json()
            print(f"      ✓ Empty HTML rejected (HTTP {response.status_code})")
            print(f"      Message: {result.get('message')}")
            print()
            return True

        print(f"      ✗ Unexpected response: {response.status_code}")
        return False

    except requests.RequestException as e:
        print(f"      ✗ Request failed: {e}")
        return False


if __name__ == "__main__":
    import sys

    # Run main integration test
    success = test_html_ingestion()

    if not success:
        sys.exit(1)

    # Run additional edge case tests
    size_test_pass = test_html_size_limit()
    empty_test_pass = test_empty_html()

    if size_test_pass and empty_test_pass:
        print("=" * 70)
        print("ALL TESTS PASSED ✓")
        print("=" * 70)
        sys.exit(0)
    else:
        print("=" * 70)
        print("SOME TESTS FAILED")
        print("=" * 70)
        sys.exit(1)
