# Roadmap

## Phase 1: Core Pipeline ✓

### 1.1 Project setup
- [x] Project foundation (requirements.txt, .gitignore, workers/ structure)
- [x] DuckDB schema with texts table and indexes
- [x] Celery + Redis configuration

### 1.2 Ingestion pipeline
- [x] Gutenberg fetcher with boilerplate stripper
- [x] Paragraph-aware text chunker (100-2000 chars)
- [x] Sentence-transformers embedder (all-MiniLM-L6-v2, 384-dim)
- [x] DuckDB storage with hash-based duplicate detection

### 1.3 Testing
- [x] End-to-end test script with verification

## Phase 2: Go API

### 2.1 Go project foundation
- [x] Initialize Go module and directory structure (`api/`)
- [x] Add dependencies (HTTP router, Redis client, DuckDB driver)
- [x] Basic server skeleton with health check endpoint

### 2.2 Redis/Celery integration
- [x] Connect to Redis broker
- [x] Helper function to queue Celery tasks from Go
- [x] Job ID generation

### 2.3 POST `/ingest`
- [ ] Accept Gutenberg URL + metadata JSON
- [ ] Duplicate detection (hash check before queueing)
- [ ] Queue job to Celery worker
- [ ] Return job ID

### 2.4 GET `/ingest/status/:id`
- [ ] Look up job status from Celery result backend
- [ ] Return status, progress, and result details

### 2.5 GET `/texts`
- [ ] List all ingested texts from DuckDB
- [ ] Include metadata (author, title, year, genre)
- [ ] Basic pagination

### 2.6 GET `/search`
- [ ] Accept query string parameter
- [ ] Embed query with sentence-transformers (or call Python)
- [ ] Vector similarity search in DuckDB
- [ ] Return ranked results with metadata

## Phase 3: PDF Support

### 3.1 PDF extraction
- [ ] Add PyMuPDF to requirements
- [ ] PDF text extraction function in workers/

### 3.2 Worker routing
- [ ] Update worker to handle `source_type: pdf`
- [ ] File path handling for uploaded PDFs

### 3.3 Upload endpoint
- [ ] POST `/upload` — accept PDF + metadata
- [ ] Save file to uploads/ directory
- [ ] Queue PDF job to worker

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
