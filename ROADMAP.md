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

### 9.2 Backend — HTML Ingestion API
- [ ] Add `readability-lxml` to worker dependencies
- [ ] Create `workers/html_extractor.py` with Readability integration
- [ ] Add `POST /ingest/html` Go endpoint accepting `{ html, url, metadata }`
- [ ] Route to new Celery task `process_html` (extract → chunk → embed → store)
- [ ] Return extracted title in response for popup display
- [ ] Add integration test for HTML ingestion flow

### 9.3 Popup UI — Save Form
- [ ] Text preview area (readonly textarea or div)
- [ ] Title input field (editable, auto-populated for full page)
- [ ] Author input field (editable)
- [ ] Tags input field (comma-separated or chips)
- [ ] Save / Cancel buttons
- [ ] Basic styling (matches Corpus aesthetic)
- [ ] Message passing setup between popup and background

### 9.4 Context Menu — Selection Capture
- [ ] Register context menu item "Save to Corpus" in background.js
- [ ] Menu appears only when text is selected (`contexts: ["selection"]`)
- [ ] Use `chrome.scripting.executeScript` to get selection
- [ ] Store selection in `chrome.storage.session` for popup access
- [ ] Open popup with selected text pre-filled
- [ ] POST to `/ingest/html` endpoint with metadata

### 9.5 Full Page Capture
- [ ] Browser action click triggers content script injection
- [ ] Content script captures `document.documentElement.outerHTML`
- [ ] Capture page title, URL, domain automatically
- [ ] Send HTML to `/ingest/html` for extraction
- [ ] Populate popup with extracted text and auto-filled title
- [ ] User can edit metadata before final save

### 9.6 Polish & Error Handling
- [ ] Loading spinner in popup during save
- [ ] Success message ("✓ Saved to Corpus")
- [ ] Error message with reason ("✗ Failed: connection refused")
- [ ] Disable save button while request in flight
- [ ] Handle offline/unreachable API gracefully
- [ ] API endpoint configurable via constant (for future settings page)
