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

API checks if text exists in DuckDB. If not, it queues the text for processing. Workers pull from the queue, extract text (from URL or PDF), embed, and store.

**Query the corpus**:
- GET `/search?q=<query>&limit=<n>` → semantic search (requires embedding service)
- GET `/texts?page=<n>&per_page=<n>` → list all ingested texts
- GET `/ingest/status/<job_id>` → check ingestion job status

## Workflow

```
                    Ingestion Flow
ingest endpoint → check DB → Redis queue → Celery workers → DuckDB
                                                              ↓
                    Search Flow                            (vectors)
React frontend → Go API → embed service → DuckDB similarity search
                            ↓
                    (query → 384-dim vector)
```

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