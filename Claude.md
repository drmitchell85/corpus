# Claude.md — Corpus Build Context

## Project Goal

Build a full-stack semantic search engine for linguistic analysis. Users submit texts via API, system checks DB for duplicates, queues processing if new, and workers asynchronously fetch, chunk, embed (all-MiniLM-L6-v2), and store in DuckDB. Frontend enables semantic search across the corpus.

## Input Sources

Two primary input methods:

1. **Project Gutenberg URLs**: Plain text URLs from gutenberg.org. Workers fetch text and strip Gutenberg boilerplate (headers/footers).

2. **PDF Uploads**: Users upload PDF files. Workers extract text using PyMuPDF. PDFs preserved in `uploads/` directory.

## Architecture

```
Ingestion API (Go) → Redis Queue → Python Workers (Celery) → DuckDB
                                                                ↑
React Frontend ← Query API (Go) ← Embedding Service (FastAPI) ←┘
```

## Tech Stack

- **Ingestion API**: Go with Chi router
- **Embedding Service**: Python FastAPI (converts search queries to vectors)
- **Queue**: Redis
- **Workers**: Python, Celery, Sentence-Transformers, PyMuPDF
- **Storage**: DuckDB
- **Frontend**: React with Vite, TypeScript

## Go API

**Ingestion endpoints**:
- `POST /ingest` → Gutenberg URL + metadata (author, title, year, genre)
  - Checks DuckDB for duplicates by URL or hash
  - Queues to Redis if new
  - Returns job ID
- `POST /upload` → PDF file (multipart/form-data) + metadata
  - Saves to `uploads/`
  - Queues to Redis
  - Returns job ID
- `GET /ingest/status/:id` → Job status (queued, processing, done, error)

**Query endpoints** (read-only DuckDB):
- `GET /search?q=<query>&limit=10` → Semantic search via embedding service
- `GET /texts?page=1&per_page=20` → List texts with metadata and pagination

API runs on `localhost:8080`. DuckDB is read-only for API; workers are exclusive writers.

## Python Workers

Celery tasks process queued jobs:

1. Extract text:
   - **Gutenberg**: Fetch + strip boilerplate
   - **PDF**: PyMuPDF extraction
2. Chunk into paragraphs (100-2000 characters)
3. Embed with `all-MiniLM-L6-v2` (384-dim vectors)
4. Store in DuckDB with metadata
5. Update job status

**Error handling**:
- Retry on network failure (max 3)
- Check DB before storing (prevent duplicates on retry)
- Mark job as failed if unrecoverable

## Redis Queue

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
├── api/              # Go HTTP server
├── workers/          # Python Celery workers
├── services/         # FastAPI embedding service
├── frontend/         # React app (Vite + TypeScript)
├── uploads/          # Uploaded PDFs (preserved)
├── corpus.db         # DuckDB database (created by workers)
├── ROADMAP.md        # Feature phase tracking
└── requirements.txt  # Python dependencies
```

## Development Workflow

**Start all services** (separate terminals):

```bash
# 1. Redis (required for queue)
redis-server

# 2. Celery workers (process ingestion jobs)
cd workers && celery -A worker worker --loglevel=info

# 3. Embedding service (required for search)
.venv/bin/uvicorn services.embed_service:app --host 0.0.0.0 --port 8001

# 4. Go API (localhost:8080)
cd api && go run cmd/server/main.go

# 5. React frontend (localhost:5173)
cd frontend && npm run dev
```

**Or use Makefile** (recommended):
```bash
make dev-all  # Starts all services in parallel (requires tmux)
```

## Frontend Conventions

**Academic Early-Internet Aesthetic**:
- Serif typography (Georgia, Times New Roman fallback)
- Cream backgrounds (#faf8f5), dark text (#2c2c2c)
- Blue links (#003d7a), minimal decoration
- Simple borders, generous whitespace
- No modern gradients/shadows/animations

**Component Patterns**:
- Prefer functional components with hooks
- Custom hooks for API calls (e.g., `useSearch`, `useTexts`)
- Shared layout wrapper (`PageLayout`) for consistent header/footer
- Pagination component reused across pages

**Styling**:
- Global styles in `index.css` (no CSS-in-JS)
- BEM naming for component-specific classes
- Mobile-first responsive design

## Testing

**Backend**:
```bash
pytest test_ingest.py  # 17 tests covering Gutenberg + PDF ingestion
```

**Frontend**:
```bash
cd frontend && npm run build  # TypeScript compilation + Vite build
```

## Scaling

To scale:
- Spawn more worker processes (consume from same Redis queue)
- Add embedding service instances for search throughput
- DuckDB handles concurrent writes from workers (sufficient for <1000 texts)

For larger corpora (1000+ texts), consider PostgreSQL with pgvector extension.

## Feature Workflow

When working on roadmap phases:

1. **Check ROADMAP.md** - Identify requirements for current phase
2. **Backend first** (if needed) - API endpoints, workers, DB changes
3. **Frontend second** - Types, API client, components, pages
4. **Update ROADMAP.md** - Mark completed items with ✓
5. **Use scratchpads** - Document in `.claude/scratchpads/WRITER.md` per global workflow

## Suggestions
I have given you access to a document at the project level located at `.claude/scratchpads/SUGGESTIONS.md`. This is a document for you to use to communicate to me without interrupting your workflow. This is to log any suggestions you have for me that may aid you. If there is a certain tool that you wish you had access to, a different way of going through your workflow, etc. please log it here. Keep suggestions concise, to the point. Do not clutter the document.