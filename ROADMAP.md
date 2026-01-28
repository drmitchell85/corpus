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

## Phase 7: Chunk Ordering ✓

- `chunk_index` column added to texts table with composite index on `(source_url, chunk_index)`
- Worker updates to pass sequential chunk indices during processing
- Migration script to backfill existing chunks ordered by insertion

## Phase 8: Chunk Detail Page ✓

- Context endpoint (`GET /chunks/{id}/context`) returning chunk with neighbors and navigation flags
- Pagination endpoints (`GET /chunks/{id}/before`, `/after`) for infinite scroll
- ChunkPage component with highlighted current chunk and surrounding context
- Load more functionality for expanding context in both directions
- Search integration with clickable results linking to chunk detail view

## Phase 9: Browser Extension

### 9.1 Extension Scaffold ✓
- [x] Create `/extension` directory structure
- [x] `manifest.json` with Manifest V3 configuration
- [x] Background service worker (`background.js`) shell
- [x] Popup HTML/JS structure (`popup.html`, `popup.js`)
- [x] Placeholder icons (16, 48, 128px)
- [x] Verify extension loads in `chrome://extensions/`

### 9.2a Worker — HTML Extraction ✓
- [x] Add `readability-lxml` to worker dependencies (`requirements.txt`)
- [x] Create `workers/html_extractor.py` using Readability for text extraction
- [x] Add `process_html` Celery task (extract → chunk → embed → store)
- [x] Unit test for HTML extraction with sample pages

### 9.2b API — HTML Ingestion Endpoint ✓
- [x] Add `POST /ingest/html` Go endpoint accepting `{ html, url, metadata }`
- [x] Validate request (SSRF protection, size limits, metadata lengths), queue `process_html` task via Redis
- [x] Return job ID in response (title/author user-provided via extension popup; extraction is fallback)
- [x] Integration test for full HTML ingestion flow
- [x] Upsert behavior: replacing existing content when same URL submitted again

### 9.3a Scaffold Fixes (from review) ✓
- [x] Fix async message handler pattern in `background.js` (use async IIFE)
- [x] Add timeout handling to popup message helper
- [x] Fix API helper to check content-type before parsing JSON

### 9.3b Popup UI — Form Structure
- [ ] Text preview area (readonly textarea or div)
- [ ] Title, author, tags input fields
- [ ] Save / Cancel buttons with click handlers
- [ ] Basic styling (matches Corpus aesthetic)

### 9.3c Popup UI — Background Integration
- [ ] Message passing between popup and background worker
- [ ] Popup receives and displays content from background
- [ ] Save button triggers API call via background worker

### 9.4 Context Menu — Selection Capture
- [ ] Register context menu item "Save to Corpus" (`contexts: ["selection"]`)
- [ ] Use `chrome.scripting.executeScript` to capture selection
- [ ] Store selection in `chrome.storage.session`
- [ ] Open popup with selected text pre-filled
- [ ] POST to `/ingest/html` endpoint on save

### 9.5a Full Page — Content Capture
- [ ] Add `tabs` permission to manifest.json
- [ ] Content script captures `document.documentElement.outerHTML`
- [ ] Extract page title, URL, domain automatically
- [ ] Store captured HTML in `chrome.storage.session`

### 9.5b Full Page — Popup Flow
- [ ] Browser action click triggers content script injection
- [ ] Send HTML to `/ingest/html`, receive extracted text
- [ ] Populate popup with extracted text and auto-filled title
- [ ] User can edit metadata before final save

### 9.6a Polish — Loading States
- [ ] Loading spinner in popup during save
- [ ] Disable save button while request in flight
- [ ] Prevent duplicate submissions

### 9.6b Polish — User Feedback
- [ ] Success message ("✓ Saved to Corpus")
- [ ] Error message with reason ("✗ Failed: connection refused")
- [ ] Auto-close popup after successful save (optional)

### 9.6c Polish — Error Handling & Config
- [ ] Handle offline/unreachable API gracefully
- [ ] API endpoint configurable via constant
- [ ] Optional: Settings page for custom API URL

## Phase 10: Deployment Hardening (Future)

Security and reliability improvements for production deployment:

- [ ] **Rate Limiting** - Per-IP request throttling to prevent abuse
- [ ] **API Key Authentication** - Optional API key requirement for ingestion endpoints
- [ ] **CORS Configuration** - Restrict access to extension-only or trusted origins
- [ ] **Request Size Monitoring** - Alerting on unusual request patterns
- [ ] **Graceful Degradation** - Fallback behavior when services unavailable
- [ ] **SSRF Protection Enhancement** - Add DNS resolution check to block domain-to-internal-IP attacks
- [ ] **Upsert Race Condition Fix** - Add distributed locking for concurrent upsert requests
- [ ] **API Consistency** - Add upsert support to `/ingest` endpoint (match `/ingest/html` behavior)

**Note:** Phase 9 focuses on local development use. Production hardening deferred to Phase 10. See `issues.md` for detailed documentation of known limitations.
