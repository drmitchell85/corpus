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

## Phase 3: PDF Support

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

### 3.4 Testing
- [ ] Test with sample PDFs

## Phase 4: React Frontend

- [ ] Search interface
- [ ] Results display with metadata
- [ ] Ingestion form (URL input + metadata fields)
- [ ] PDF upload form
- [ ] Job status indicator

## Phase 5: Polish

- [ ] Error handling and retries
- [ ] Input validation
- [ ] Basic logging
