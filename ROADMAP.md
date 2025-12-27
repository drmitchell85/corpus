# Roadmap

## Phase 1: Core Pipeline

### 1.1 Project foundation
- [x] `requirements.txt` (celery, redis, sentence-transformers, duckdb, requests)
- [x] `.gitignore` (corpus.db, __pycache__, uploads/, .env, venv/)
- [x] Create `workers/` directory structure

### 1.2 DuckDB schema setup
- [x] Schema initialization script/function
- [x] Create `texts` table with embedding column (FLOAT4[384])
- [x] Create indexes on year and genre

### 1.3 Celery + Redis configuration
- [x] `workers/celery_config.py` — Celery app config with Redis broker
- [x] Basic `workers/worker.py` skeleton with task decorator

### 1.4 Gutenberg fetcher + boilerplate stripper
- [x] Function to fetch text from Gutenberg URL
- [x] Function to strip Gutenberg header/footer markers

### 1.5 Text chunker
- [x] Function to split text into chunks (100-2000 chars)
- [x] Paragraph-aware splitting logic

### 1.6 Embedding with sentence-transformers
- [ ] Load `all-MiniLM-L6-v2` model
- [ ] Function to embed text chunks → 384-dim vectors

### 1.7 DuckDB storage + task wiring
- [ ] Function to store chunks + embeddings in DuckDB
- [ ] Hash generation for duplicate detection
- [ ] Wire all components into the Celery task

### 1.8 End-to-end test
- [ ] Test script to manually ingest a Gutenberg text
- [ ] Verify data in DuckDB

## Phase 2: Go API

- [ ] POST `/ingest` — accept Gutenberg URL + metadata, queue job
- [ ] POST `/upload` — accept PDF + metadata, save file, queue job
- [ ] GET `/ingest/status/:id` — job status lookup
- [ ] GET `/texts` — list all ingested texts
- [ ] GET `/search` — semantic search
- [ ] Duplicate detection (hash check before queueing)

## Phase 3: PDF Support

- [ ] Python worker: PDF text extraction (PyMuPDF)
- [ ] Worker routing based on `source_type`
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
- [ ] .gitignore cleanup
