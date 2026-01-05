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

### 5.1 Error Handling — Go API ✓
- [x] Add structured error logging before generic responses (`handler/*.go`)
- [x] Log actual errors with context (db, celery, embed, redis failures)
- [x] Handle JSON encoding errors in `response.go`, `router.go`
- [x] Add `http.MaxBytesReader` to ingest endpoint (like upload)
- [x] Log warning when redis URL parse fails and fallback is used

### 5.2 Error Handling — Python Workers
- [x] Catch specific exceptions in `gutenberg.py` (ConnectionError, Timeout, HTTPError)
- [x] Catch `fitz.FileDataError` for corrupt PDFs in `pdf.py`
- [x] Wrap model loading in try/except in `embedder.py`
- [x] Replace blanket retry with whitelist of retryable exceptions in `worker.py`

### 5.3 Retry Configuration — Python Workers ✓
- [x] Add exponential backoff to Celery task (`retry_backoff=True`, `retry_jitter=True`)
- [x] Add task timeouts (`task_time_limit=600`, `task_soft_time_limit=540`)
- [x] Add HTTP-level retries to `gutenberg.py` with `requests.adapters.HTTPAdapter`
- [x] Make `max_retries` configurable via environment variable

### 5.4 Error Handling — Frontend ✓
- [x] Wrap all `fetch()` calls in try/catch in `api/client.ts`
- [x] Differentiate network vs server errors in `useSearch.ts`, `useTexts.ts`
- [x] Add retry logic (3 attempts) to `JobStatusIndicator.tsx` before marking failed

### 5.5 Input Validation — Go API ✓
- [x] Validate URL format (parse, check http/https scheme) in `ingest.go`
- [x] Validate PDF magic bytes `%PDF-` not just extension in `upload.go`
- [x] Validate year is integer in range 1000-2100 in `upload.go`
- [x] Validate search query length (1-1000 chars) in `search.go`
- [x] Validate job_id is UUID format in `status.go`
- [x] Add config validation on startup (paths writable, services reachable)

### 5.6 Input Validation — Frontend ✓
- [x] Validate search query 3+ chars min, 500 chars max in `SearchInput.tsx`
- [x] Auto-prepend `https://` if missing protocol in `IngestPage.tsx`
- [x] Validate year is integer with `Number.isInteger()` in forms
- [x] Validate MIME type `application/pdf` not just extension in `UploadPage.tsx`

### 5.7 Logging — Go API ✓
- [x] Add `log/slog` structured logging infrastructure
- [x] Log startup config (port, db path, embed URL, redis URL sanitized)
- [x] Add request logging middleware (request ID, method, path, status, duration)
- [x] Log incoming requests with params in handlers
- [x] Log operation outcomes and timing for external calls

### 5.8 Logging — Python Workers ✓
- [x] Add structured logging setup in `__init__.py` (JSON format, task_id propagation)
- [x] Log task lifecycle in `worker.py` (start, fetch, chunk, embed, store, retry)
- [x] Log network operations in `gutenberg.py` (URL, response size, time)
- [x] Log PDF extraction in `pdf.py` (file path, page count, time)
- [x] Log embeddings in `embedder.py` (model load, batch size, throughput)
- [x] Log database operations in `db.py` (transactions, stored/skipped counts)

## Phase 6: Delete Functionality

### 6.1 Backend — Database Layer ✓
- [x] Add `getWriteConnection()` helper for read-write database access in `db/db.go`
- [x] Add `GetSourceURLByID(ctx, id)` function to get source_url from text ID
- [x] Add `DeleteTextBySourceURL(ctx, sourceURL)` function to delete all chunks
- [x] Add structured logging for delete operations (chunks_deleted, duration)
- [x] Handle edge cases (non-existent source_url returns 0, not error)

### 6.2 Backend — API Handler ✓
- [x] Add `DeleteTextResponse` model to `models/models.go` (id, source_url, chunks_deleted, message)
- [x] Add `DeleteText` handler to `handler/texts.go` (parse ID, get source_url, delete, respond)
- [x] Add route `r.Delete("/texts/{id}", handler.DeleteText)` to `router/router.go`
- [x] Handle errors: 400 for invalid ID format, 404 for not found, 500 for database errors
- [x] Add request logging with context (request_id, text_id)
- [x] Handle race condition (chunksDeleted == 0 returns 404)
- [x] Ensure type consistency (all ID fields are int64)

### 6.3 Backend — PDF Cleanup (Optional Enhancement) ✓
- [x] Investigate PDF file naming in `handler/upload.go` to understand source_url pattern
- [x] Add helper to detect if source is uploaded PDF with canonical path validation
- [x] Add helper to safely delete PDF file with security hardening
- [x] Delete PDF file from `./uploads/` after successful chunk deletion
- [x] Log warnings for missing files (don't fail delete operation)
- [x] Add path traversal protection (canonical path checking)
- [x] Add symlink and hardlink detection
- [x] Add TOCTOU race condition protection

### 6.4 Frontend — API Client ✓
- [x] Add `DeleteTextResponse` type to `types/api.ts`
- [x] Add `deleteText(id: number)` function to `api/client.ts` (DELETE request)
- [x] Export `deleteText` from `api/index.ts`
- [x] Handle errors: ApiError for 404/500, NetworkError for network failures
- [x] Add client-side input validation (safe positive integer check)
- [x] Add comprehensive JSDoc documentation with error types

### 6.5 Frontend — Delete Hook ✓
- [x] Create `hooks/useDeleteText.ts` hook with delete state management
- [x] Implement `deleteText(id)` with error handling (NetworkError, ApiError 404/500)
- [x] Add `onSuccess` callback support for triggering refresh after delete
- [x] Add unmount guard with `mountedRef` pattern (consistent with other hooks)
- [x] Export hook from `hooks/index.ts`

### 6.6 Frontend — Delete Button UI ✓
- [x] Add `onDelete` and `isDeleting` props to `TextCard` component
- [x] Add delete button to `TextCard.tsx` with confirmation dialog
- [x] Show chunk count in confirmation message ("delete X chunks")
- [x] Integrate `useDeleteText` hook in `LibraryPage.tsx`
- [x] Call `refresh()` after successful deletion to update list
- [x] Display delete errors in error banner with dismiss button
- [x] Track `deletingId` state to show loading on specific card

### 6.7 Frontend — Styling ✓
- [x] Add `.text-card__delete-btn` styles (danger color scheme: red)
- [x] Add hover state (darker red)
- [x] Add disabled state (gray, cursor not-allowed)
- [x] Position button appropriately in card layout
- [x] Ensure accessibility (focus states, keyboard navigation)
