# Claude.md — Corpus Build Context

## Project Goal

Build a full-stack application with asynchronous text ingestion. Users submit text sources via API, the system checks if the text exists in the DB, queues processing if new, and workers asynchronously fetch, chunk, embed, and store. Frontend queries the corpus. Scalable to web deployment.

## Input Sources

Two primary input methods:

1. **Project Gutenberg URLs**: Plain text URLs from gutenberg.org. Workers fetch the text, strip Gutenberg boilerplate (headers/footers), and process.

2. **PDF Uploads**: Users upload PDF files. Workers extract text using PyMuPDF, then process normally. PDFs stored locally in `uploads/` directory.

## Architecture

```
Ingestion API (Go)
    ↓
Redis Queue
    ↓
Python Workers (Celery)
    ↓
DuckDB (Storage)
    ↑
Query API (Go)
    ↑
React Frontend
```

## Tech Stack

- **API/Ingestion**: Go, Redis client
- **Queue**: Redis
- **Workers**: Python, Celery, Sentence-Transformers, PyMuPDF, DuckDB
- **Storage**: DuckDB
- **Frontend**: React

## Go API (main.go)

Two main responsibilities:

**Ingestion endpoints**:
- POST `/ingest` → Accepts Project Gutenberg URL and metadata (author, title, year, genre)
  - Checks if text already exists in DuckDB (by source URL or hash)
  - If text doesn't exist: creates task, pushes to Redis queue
  - Returns job ID and status
- POST `/upload` → Accepts PDF file upload (multipart/form-data) and metadata
  - Saves PDF to `uploads/` directory
  - Creates task with file path, pushes to Redis queue
  - Returns job ID and status
- GET `/ingest/status/<job_id>` → Returns job status (queued, processing, done, error)

**Query endpoints** (read-only DuckDB):
- GET `/search?q=<query>&limit=10` → Semantic search
- GET `/compare?term1=<t1>&term2=<t2>` → Semantic distance
- GET `/texts` → List all texts with metadata

API runs on localhost:8000.

DuckDB is read-only for the API; workers are the only writers.

## Python Workers (worker.py + celery_config.py)

Celery tasks that process ingested texts:

**Fetch and embed task**:
1. Receive job (source URL or PDF path, metadata)
2. Extract text:
   - **Gutenberg URL**: Fetch text, strip boilerplate headers/footers
   - **PDF file**: Extract text using PyMuPDF (fitz)
3. Chunk into paragraphs (100-2000 characters)
4. Embed each chunk with Sentence-Transformers "all-MiniLM-L6-v2"
5. Store in DuckDB: text, embedding, author, title, year, source, genre
6. Mark job as complete

**Error handling**:
- Retry on network failure (max 3 retries)
- Log errors
- Mark job as failed if unrecoverable
- Prevent duplicates on retry by checking DB before storing

## Redis Queue

Stores job messages. Workers consume from queue.

Job message format:
```json
{
  "job_id": "uuid",
  "source_type": "gutenberg" | "pdf",
  "source_url": "https://www.gutenberg.org/...",
  "pdf_path": "uploads/abc123.pdf",
  "metadata": {
    "author": "name",
    "title": "title",
    "year": 2020,
    "genre": "essay"
  }
}
```

Redis handles queue persistence and worker coordination. Celery abstracts Redis interaction.

## DuckDB Schema

```sql
CREATE TABLE texts (
  id INTEGER PRIMARY KEY,
  source_url VARCHAR,
  text VARCHAR,
  embedding FLOAT4[384],
  author VARCHAR,
  title VARCHAR,
  year INTEGER,
  genre VARCHAR,
  created_at TIMESTAMP,
  hash VARCHAR UNIQUE
);

CREATE INDEX idx_year ON texts(year);
CREATE INDEX idx_genre ON texts(genre);
```

## File Structure

```
corpus/
├── README.md
├── Claude.md
├── requirements.txt (Python dependencies)
├── go.mod, go.sum (Go dependencies)
├── package.json (React dependencies)
├── api/
│   └── main.go (ingestion and query endpoints)
├── workers/
│   ├── worker.py (Celery tasks)
│   └── celery_config.py (Celery and Redis setup)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── ...
│   └── ...
├── uploads/ (PDF files stored here)
├── corpus.db (created by workers)
└── .gitignore
```

## Development Workflow

1. **Start Redis** (required for queue)
   ```bash
   redis-server
   ```

2. **Start workers** (pulls from queue, processes texts)
   ```bash
   python -m celery -A workers.worker worker --loglevel=info
   ```

3. **Start API** (accepts ingestion, serves queries)
   ```bash
   go run api/main.go
   ```

4. **Start frontend** (lets users interact)
   ```bash
   npm start
   ```

5. **Test ingestion**
   ```bash
   curl -X POST http://localhost:8000/ingest \
     -H "Content-Type: application/json" \
     -d '{
       "source_url": "https://example.com/text.txt",
       "metadata": {"author": "Name", "title": "Title", "year": 2020, "genre": "essay"}
     }'
   ```

   Workers will pick up the job from Redis, process asynchronously, and store in DuckDB.

## Scaling

To scale:
- Spawn more worker processes (each consumes from the same Redis queue)
- Redis handles job distribution
- Multiple workers can process texts in parallel
- DuckDB handles concurrent writes from workers (though slower than single writer; fine for now)

For massive scale, you could swap DuckDB for PostgreSQL, but it's unnecessary for 100-500 texts.

## Deployment (Future)

To move to the web:
- Host Redis on server (or use managed Redis service)
- Host DuckDB on server
- Deploy Go API binary
- Deploy Python workers as systemd service or in containers
- Deploy React build as static assets

No code changes needed. Just point everything at remote Redis and DuckDB.

 ## Typical Workflow

When working on a new feature phase:

1. **Check ROADMAP.md** - Identify the current chunk and its requirements
2. **Backend first** - Create/update service, controller, routes, Swagger docs
3. **Frontend second** - Create/update types, API client, components, pages
4. **Update documentation:**
    - Mark completed items in `ROADMAP.md`
    - Update Swagger JSDoc if API changed
    - Update Postman collection if endpoints added/changed
5. **Provide commit message** when requested

**Commit Message Format:**
```
feat: brief description

- Backend changes
- Frontend changes
- Documentation updates

[Claude Code]
```