# HTML Ingestion API

## Endpoint: `POST /ingest/html`

Accepts HTML content for text extraction, chunking, embedding, and storage.

### Request

**URL:** `http://localhost:8080/ingest/html`

**Method:** `POST`

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "html": "<html>...</html>",           // Required: HTML content (max 10MB)
  "url": "https://example.com/page",    // Optional: Source URL
  "metadata": {                          // Optional: Metadata
    "title": "Article Title",
    "author": "Author Name",
    "year": 2026,
    "genre": "article"
  }
}
```

**Field Details:**
- `html` (string, required): Raw HTML content to process. Must be non-empty and ≤10MB.
- `url` (string, optional): Source URL of the HTML. If omitted, worker uses `html-{job_id}` as fallback.
- `metadata` (object, optional): Metadata to associate with extracted text chunks.
  - `title` (string): Document title. If omitted, worker auto-extracts from HTML.
  - `author` (string): Author name
  - `year` (integer): Publication year
  - `genre` (string): Document genre/category

### Response

**Success (202 Accepted):**
```json
{
  "job_id": "abc-123-def-456",
  "status": "queued",
  "message": "HTML job queued for processing"
}
```

**Error (400 Bad Request):**
```json
{
  "status": "error",
  "message": "html is required"
}
```

**Error (413 Request Entity Too Large):**
```json
{
  "status": "error",
  "message": "request body too large"
}
```

### Job Status

Poll `GET /ingest/status/{job_id}` to check processing status.

**Success Response:**
```json
{
  "job_id": "abc-123-def-456",
  "status": "SUCCESS",
  "result": {
    "job_id": "abc-123-def-456",
    "status": "success",
    "source_type": "html",
    "chunks_processed": 12,
    "chunks_stored": 12,
    "chunks_skipped": 0,
    "extracted_title": "Auto-Extracted Title from HTML"
  }
}
```

### Example Usage

**cURL:**
```bash
# Basic HTML ingestion
curl -X POST http://localhost:8080/ingest/html \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><body><article><h1>Title</h1><p>Content here.</p></article></body></html>",
    "url": "https://example.com/article",
    "metadata": {
      "author": "John Doe",
      "year": 2026
    }
  }'

# Response:
# {"job_id":"...","status":"queued","message":"HTML job queued for processing"}

# Check status
curl http://localhost:8080/ingest/status/{job_id}
```

**JavaScript (Browser Extension):**
```javascript
async function ingestHTML(html, url, metadata) {
  const response = await fetch('http://localhost:8080/ingest/html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, url, metadata })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  const result = await response.json();
  return result.job_id;
}

// Usage
const jobId = await ingestHTML(
  document.documentElement.outerHTML,
  window.location.href,
  { title: 'My Article', author: 'Author Name' }
);
```

### Processing Pipeline

1. **API validates request**
   - Checks HTML is non-empty
   - Enforces 10MB size limit
   - Queues Celery task `workers.worker.process_html`

2. **Worker extracts text**
   - Uses Mozilla Readability algorithm
   - Strips HTML tags, navigation, ads, boilerplate
   - Decodes HTML entities
   - Auto-extracts title if not provided in metadata

3. **Worker chunks text**
   - Paragraph-aware chunking
   - Sequential chunk indices

4. **Worker generates embeddings**
   - sentence-transformers (all-MiniLM-L6-v2, 384-dim)
   - Hash-based deduplication

5. **Worker stores in DuckDB**
   - Chunks with embeddings
   - Metadata preserved
   - Source URL for grouping

### Error Handling

| Status Code | Condition | Message |
|-------------|-----------|---------|
| 400 | Empty HTML | `"html is required"` |
| 400 | HTML > 10MB | `"html content too large (max 10MB)"` |
| 413 | Request body > 50MB | `"request body too large"` |
| 500 | Queue failure | `"failed to queue job"` |

Worker errors (extraction failure, etc.) are reported via job status, not HTTP response.

### Notes

- **Async Processing:** Endpoint returns immediately (202 Accepted). Poll status endpoint for completion.
- **Upsert Behavior:** If the same source URL is submitted again, existing chunks are deleted and replaced with new content. This allows updating saved pages from the browser extension.
- **Size Limits:** API enforces 10MB limit matching worker's `MAX_HTML_SIZE`. Defense in depth approach.
- **SSRF Protection:** URLs are validated to prevent internal network access. Only HTTP/HTTPS schemes allowed, blocks localhost and private IPs.
- **Metadata Limits:** Title (max 500 chars), author (max 200 chars), genre (max 100 chars).
- **Title Extraction:** If metadata.title not provided, worker auto-extracts from `<title>` tag or `<h1>`.
- **URL Fallback:** If url not provided, worker uses `html-{job_id}` as source_url.
