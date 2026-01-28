# Corpus

Semantic search and analysis of linguistic patterns around atomization, community, and institutional decay.

Ingests texts via API, processes them asynchronously through workers, stores embeddings in DuckDB, and enables semantic search across time periods.

## Tech Stack

- **Ingestion API**: Go with Chi router (accepts texts, checks DB, queues processing)
- **Embedding Service**: Python FastAPI (converts search queries to vectors)
- **Task Queue**: Redis (queues text processing jobs)
- **Workers**: Python Celery (fetch, chunk, embed, store)
- **Storage**: DuckDB (embedded vectors and metadata)
- **Frontend**: React (search interface)
- **Browser Extension**: Chrome/Edge extension for capturing web content (Manifest V3)

## Setup

```bash
# Install dependencies
pip install -r requirements.txt
cd api && go mod download && cd ..
npm install

# Start Redis (required for queue)
redis-server

# Start Celery workers (in separate terminal)
cd workers && celery -A worker worker --loglevel=info

# Start embedding service (in separate terminal, required for search)
uvicorn services.embed_service:app --host 0.0.0.0 --port 8001

# Start Go API (localhost:8080)
cd api && go run cmd/server/main.go

# Start frontend (localhost:3000)
npm start
```

## Usage

**Ingest from Project Gutenberg**:
```
POST /ingest
{
  "source_url": "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
  "metadata": {
    "author": "Jane Austen",
    "title": "Pride and Prejudice",
    "year": 1813,
    "genre": "novel"
  }
}
```

**Upload a PDF**:
```
POST /upload
Content-Type: multipart/form-data

file: <pdf file>
author: "Author Name"
title: "Title"
year: 2020
genre: "essay"
```

**Ingest HTML from browser**:
```
POST /ingest/html
{
  "html": "<html>...</html>",
  "url": "https://example.com/article",
  "metadata": {
    "author": "Author Name",
    "title": "Article Title",
    "year": 2024
  }
}
```

API checks if text exists in DuckDB. If URL already exists, old chunks are replaced (upsert behavior). Workers pull from queue, extract text (from URL, PDF, or HTML), embed, and store.

**Query the corpus**:
- GET `/search?q=<query>&limit=<n>` → semantic search (requires embedding service)
- GET `/texts?page=<n>&per_page=<n>` → list all ingested texts
- GET `/ingest/status/<job_id>` → check ingestion job status

**Browser extension** (see `extension/README.md`):
- Load unpacked extension from `/extension` in `chrome://extensions/`
- Right-click selected text → "Save to Corpus"
- Click extension icon → save full page

## Architecture

### Ingestion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  USER SUBMITS TEXT                                              │
│  POST /ingest (URL) | POST /upload (PDF) | POST /ingest/html   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  GO API                                                         │
│  ├── Validates request (SSRF protection, size limits)           │
│  ├── Checks DuckDB for duplicates (upsert if exists)            │
│  ├── Saves PDF to ./uploads/ (if PDF upload)                    │
│  └── Queues job to Redis                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PYTHON WORKER (picks up job from Redis)                        │
│  ├── workers/gutenberg.py fetches + strips boilerplate (URL)    │
│  ├── workers/pdf.py extracts text from PDF (upload)             │
│  ├── workers/html_extractor.py extracts text from HTML (browser)│
│  ├── workers/chunker.py splits text into paragraphs             │
│  ├── workers/embedder.py converts chunks → 384-dim vectors      │
│  └── workers/db.py stores chunks + embeddings → DuckDB          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DUCKDB                                                         │
│  └── Stores: text chunks, vector embeddings, metadata           │
└─────────────────────────────────────────────────────────────────┘
```

### Search Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  USER SEARCHES                                                  │
│  GET /search?q=community+decline                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  GO API                                                         │
│  └── Forwards query to embedding service                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  EMBEDDING SERVICE (FastAPI)                                    │
│  └── Converts query text → 384-dim vector (all-MiniLM-L6-v2)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DUCKDB                                                         │
│  └── Vector similarity search, returns ranked results           │
└─────────────────────────────────────────────────────────────────┘
```

### Data Storage

| Location | Contents |
|----------|----------|
| `./uploads/` | Original PDF files (preserved for re-processing) |
| Redis | Temporary job queue messages |
| DuckDB | Text chunks, 384-dim embeddings, metadata (author, title, year, genre) |

## Deployment

Local development runs everything on localhost. To deploy:
- Move Redis to server or use managed Redis
- Move DuckDB file to server
- Deploy Go API binary
- Deploy embedding service (FastAPI/uvicorn)
- Deploy Celery workers as service or container
- Deploy React build as static assets
- Point frontend at remote API

Architecture scales: add more Celery workers for ingestion, more embedding service instances for search throughput.