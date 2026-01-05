# Roadmap

## Phase 1: Core Pipeline ✓

- Project foundation with DuckDB schema, Celery + Redis configuration
- Gutenberg ingestion pipeline with boilerplate stripping and paragraph-aware chunking
- Sentence-transformers embedding (all-MiniLM-L6-v2, 384-dim) with hash-based deduplication
- End-to-end testing and verification

## Phase 2: Go API ✓

- Go HTTP server with Redis/Celery integration for async job processing
- POST `/ingest` endpoint with duplicate detection and job queuing
- GET `/ingest/status/:id` for job progress tracking
- GET `/texts` with metadata and pagination
- GET `/search` with vector similarity search and ranked results

## Phase 3: PDF Support ✓

- PyMuPDF integration for PDF text extraction
- Worker routing for `source_type: pdf` with file path handling
- POST `/upload` endpoint for PDF files with metadata
- File storage in `uploads/` directory with job queuing

## Phase 4: React Frontend ✓

- Vite + TypeScript React app with API client utilities
- Academic early-internet aesthetic (serif typography, cream backgrounds, minimal decoration)
- Search interface with results display, similarity scores, and pagination
- Text library view with metadata and pagination
- Ingestion form (URL) and PDF upload form with validation
- Job status polling with progress indicator

## Phase 5: Polish ✓

- Structured error handling across Go API, Python workers, and frontend
- Retry configuration with exponential backoff and task timeouts
- Input validation (URL format, PDF magic bytes, year range, query length)
- Structured logging with `log/slog` (Go) and JSON format (Python)
- Request logging middleware with request IDs and timing

## Phase 6: Delete Functionality ✓

- Database layer with `DeleteTextBySourceURL()` for bulk chunk deletion
- DELETE `/texts/{id}` endpoint with proper error handling (400/404/500)
- PDF file cleanup with path traversal protection and TOCTOU safeguards
- Frontend delete button with confirmation dialog and optimistic UI updates

## Phase 7: Chunk Ordering

### 7.1 Schema Migration ✓
- [x] Add `chunk_index` column (INTEGER) to `texts` table in `workers/db.py`
- [x] Create index on `(source_url, chunk_index)` for efficient ordering queries
- [x] Update `store_chunks()` to accept and store chunk indices

### 7.2 Worker Updates ✓
- [x] Update `worker.py` to pass chunk indices (enumerate during processing)
- [x] Ensure indices are 0-based, sequential within each source

### 7.3 Backfill Existing Data ✓
- [x] Add migration script to assign `chunk_index` to existing chunks
- [x] Order by `id` ASC within each `source_url` (preserves insertion order)
- [x] Verify migration with test queries

## Phase 8: Chunk Detail Page

### 8.1 Backend — Context Endpoint ✓
- [x] Add `GetChunkContext(ctx, id, window)` to `db/db.go`
- [x] Query current chunk, count total chunks for source
- [x] Query before/after chunks using `chunk_index` ordering
- [x] Return `has_more_before`, `has_more_after` flags
- [x] Add `ChunkContextResponse` model to `models/models.go`
- [x] Add `GET /chunks/{id}/context` handler in `handler/chunks.go`
- [x] Register route in `router/router.go`

### 8.2 Backend — Pagination Endpoints
- [ ] Add `GET /chunks/{id}/before?limit=3` endpoint
- [ ] Add `GET /chunks/{id}/after?limit=3` endpoint
- [ ] Use `chunk_index` for efficient range queries
- [ ] Return chunks ordered appropriately (before: DESC, after: ASC)

### 8.3 Frontend — API Client
- [ ] Add `ChunkContext` type to `types/api.ts`
- [ ] Add `getChunkContext(id, window)` function to `api/client.ts`
- [ ] Add `getChunksBefore(id, limit)` function
- [ ] Add `getChunksAfter(id, limit)` function

### 8.4 Frontend — Chunk Page
- [ ] Add `/chunk/:id` route to `App.tsx`
- [ ] Create `ChunkPage.tsx` component
- [ ] Create `useChunkContext` hook with state management
- [ ] Display current chunk (highlighted) + neighbors
- [ ] Show metadata header (title, author, year, position)
- [ ] Add "Back to Search" navigation

### 8.5 Frontend — Load More
- [ ] Add "Load previous" button (above chunks, hidden if `!has_more_before`)
- [ ] Add "Load more" button (below chunks, hidden if `!has_more_after`)
- [ ] Implement chunk prepending/appending to state
- [ ] Loading states for buttons
- [ ] Smaller initial window on mobile (0 before/after vs 1+1)

### 8.6 Frontend — Search Integration
- [ ] Make `ResultCard` clickable (wrap text in `Link`)
- [ ] Navigate to `/chunk/{id}` on click
- [ ] Preserve search query in URL/state for back navigation
