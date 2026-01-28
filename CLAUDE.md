# Corpus - Project Context

Semantic search corpus for analyzing linguistic patterns. Ingests texts via API, processes asynchronously, stores embeddings in DuckDB.

## Project Structure

```
corpus/
├── api/             # Go HTTP server (Chi router)
├── workers/         # Python Celery workers
├── services/        # Python embedding service (FastAPI)
├── frontend/        # React app (Vite + TypeScript)
├── extension/       # Chrome extension (Manifest V3)
├── uploads/         # PDF file storage
└── tests/           # Integration tests
```

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /ingest` | Queue URL for ingestion (Gutenberg, etc.) |
| `POST /ingest/html` | Queue raw HTML/text from extension |
| `POST /upload` | Upload PDF file |
| `GET /search` | Semantic similarity search |
| `GET /texts` | List ingested texts |
| `GET /chunks/{id}/context` | Chunk with surrounding context |

## Development

```bash
# Start all services
redis-server
cd workers && celery -A worker worker --loglevel=info
uvicorn services.embed_service:app --port 8001
cd api && go run cmd/server/main.go
cd frontend && npm run dev
```

## Current Work

See `ROADMAP.md` for phase status. Active development on Phase 9 (Browser Extension).

## Known Issues

See `issues.md` for tracked limitations and technical debt. This file documents issues that are acceptable for local use but should be addressed before production deployment.
