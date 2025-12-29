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

### 3.1 PDF extraction ✓
- [x] Add PyMuPDF to requirements
- [x] PDF text extraction function in workers/

### 3.2 Worker routing ✓
- [x] Update worker to handle `source_type: pdf`
- [x] File path handling for uploaded PDFs

### 3.3 Upload endpoint ✓
- [x] POST `/upload` — accept PDF + metadata
- [x] Save file to uploads/ directory
- [x] Queue PDF job to worker

### 3.4 Testing ✓
- [x] Test with sample PDFs (17 tests: unit + integration)

## Phase 4: React Frontend

### 4.1 Project Setup ✓
- [x] Initialize React app with Vite
- [x] Configure TypeScript and project structure
- [x] Set up API client utilities for backend communication

### 4.2 Academic Layout & Styling ✓
- [x] Create base CSS with academic early-internet aesthetic
- [x] Serif typography (Georgia/Times), minimal decoration
- [x] Simple navigation header and page layout components
- [x] Color palette: cream backgrounds, blue links, subtle borders

### 4.3 Search Interface ✓
- [x] Search input component with submit button
- [x] Connect to GET `/search` endpoint
- [x] Loading state handling

### 4.4 Results Display ✓
- [x] Result card component with passage text and metadata
- [x] Source attribution with title, author, year
- [x] Similarity score display
- [x] Paginated results list

### 4.5 Text Library View ✓
- [x] List all ingested texts via GET `/texts`
- [x] Display metadata (title, author, source type)
- [x] Pagination controls

### 4.6 Ingestion Form (URL) ✓
- [x] URL input with metadata fields (title, author, year)
- [x] Form validation
- [x] Submit to POST `/ingest` endpoint

### 4.7 PDF Upload Form ✓
- [x] File input for PDF selection
- [x] Metadata fields for uploaded document
- [x] Submit to POST `/upload` endpoint

### 4.8 Job Status Indicator ✓
- [x] Poll GET `/ingest/status/:id` after submission
- [x] Progress indicator component
- [x] Success/error state display

## Phase 5: Polish

### 5.1 Error Handling — Go API
- [ ] Add structured error logging before generic responses (`handler/*.go`)
- [ ] Log actual errors with context (db, celery, embed, redis failures)
- [ ] Handle JSON encoding errors in `response.go`, `router.go`
- [ ] Add `http.MaxBytesReader` to ingest endpoint (like upload)
- [ ] Log warning when redis URL parse fails and fallback is used

### 5.2 Error Handling — Python Workers
- [ ] Catch specific exceptions in `gutenberg.py` (ConnectionError, Timeout, HTTPError)
- [ ] Catch `fitz.FileDataError` for corrupt PDFs in `pdf.py`
- [ ] Wrap model loading in try/except in `embedder.py`
- [ ] Replace blanket retry with whitelist of retryable exceptions in `worker.py`

### 5.3 Retry Configuration — Python Workers
- [ ] Add exponential backoff to Celery task (`retry_backoff=True`, `retry_jitter=True`)
- [ ] Add task timeouts (`task_time_limit=600`, `task_soft_time_limit=540`)
- [ ] Add HTTP-level retries to `gutenberg.py` with `requests.adapters.HTTPAdapter`
- [ ] Make `max_retries` configurable via environment variable

### 5.4 Error Handling — Frontend
- [ ] Wrap all `fetch()` calls in try/catch in `api/client.ts`
- [ ] Differentiate network vs server errors in `useSearch.ts`, `useTexts.ts`
- [ ] Add retry logic (3 attempts) to `JobStatusIndicator.tsx` before marking failed

### 5.5 Input Validation — Go API
- [ ] Validate URL format (parse, check http/https scheme) in `ingest.go`
- [ ] Validate PDF magic bytes `%PDF-` not just extension in `upload.go`
- [ ] Validate year is integer in range 1000-2100 in `upload.go`
- [ ] Validate search query length (1-1000 chars) in `search.go`
- [ ] Validate job_id is UUID format in `status.go`
- [ ] Add config validation on startup (paths writable, services reachable)

### 5.6 Input Validation — Frontend
- [ ] Validate search query 3+ chars min, 500 chars max in `SearchInput.tsx`
- [ ] Auto-prepend `https://` if missing protocol in `IngestPage.tsx`
- [ ] Validate year is integer with `Number.isInteger()` in forms
- [ ] Validate MIME type `application/pdf` not just extension in `UploadPage.tsx`

### 5.7 Logging — Go API
- [ ] Add `log/slog` structured logging infrastructure
- [ ] Log startup config (port, db path, embed URL, redis URL sanitized)
- [ ] Add request logging middleware (request ID, method, path, status, duration)
- [ ] Log incoming requests with params in handlers
- [ ] Log operation outcomes and timing for external calls

### 5.8 Logging — Python Workers
- [ ] Add structured logging setup in `__init__.py` (JSON format, task_id propagation)
- [ ] Log task lifecycle in `worker.py` (start, fetch, chunk, embed, store, retry)
- [ ] Log network operations in `gutenberg.py` (URL, response size, time)
- [ ] Log PDF extraction in `pdf.py` (file path, page count, time)
- [ ] Log embeddings in `embedder.py` (model load, batch size, throughput)
- [ ] Log database operations in `db.py` (transactions, stored/skipped counts)
