# Corpus

Semantic search and analysis of linguistic patterns around atomization, community, and institutional decay.

Ingests texts via API, processes them asynchronously through workers, stores embeddings in DuckDB, and enables semantic search across time periods.

## Tech Stack

- **Ingestion API**: Go (accepts texts, checks DB, queues processing)
- **Task Queue**: Redis (queues text processing jobs)
- **Workers**: Python (fetch, chunk, embed, store)
- **Storage**: DuckDB (embedded vectors and metadata)
- **Frontend**: React (search interface)

## Setup

```bash
# Install dependencies
pip install -r requirements.txt
go mod download
npm install

# Start Redis (required for queue)
redis-server

# Start workers (in separate terminal)
python -m celery -A worker worker --loglevel=info

# Start API backend (localhost:8000)
go run main.go

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
- GET `/search?q=<term>` → semantic search
- GET `/compare?term1=<t1>&term2=<t2>` → term comparison
- GET `/texts` → list all ingested texts

## Workflow

```
ingest endpoint → check DB → Redis queue → workers → DuckDB
                                              ↓
                          API endpoints ← DuckDB
                              ↑
                         React frontend
```

## Deployment

Local development runs everything on localhost. To deploy:
- Move Redis to server or use managed Redis
- Move DuckDB file to server
- Deploy Go API binary
- Deploy Python workers as service or container
- Deploy React build as static assets
- Point frontend at remote API

Architecture scales: add more workers, same queue, same DB.