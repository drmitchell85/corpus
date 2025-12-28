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

### 4.5 Text Library View
- [ ] List all ingested texts via GET `/texts`
- [ ] Display metadata (title, author, source type)
- [ ] Pagination controls

### 4.6 Ingestion Form (URL)
- [ ] URL input with metadata fields (title, author, year)
- [ ] Form validation
- [ ] Submit to POST `/ingest` endpoint

### 4.7 PDF Upload Form
- [ ] File input for PDF selection
- [ ] Metadata fields for uploaded document
- [ ] Submit to POST `/upload` endpoint

### 4.8 Job Status Indicator
- [ ] Poll GET `/ingest/status/:id` after submission
- [ ] Progress indicator component
- [ ] Success/error state display

## Phase 5: Polish

- [ ] Error handling and retries
- [ ] Input validation
- [ ] Basic logging
