# Claude.md — Corpus Build Context

## Project Goal

Build a full-stack application with asynchronous text ingestion. Users submit text sources via API, the system checks if the text exists in the DB, queues processing if new, and workers asynchronously fetch, chunk, embed, and store. Frontend queries the corpus. Scalable to web deployment.

## Code Philosophy

**Pragmatic Functional Programming** — not strict, but guided by FP principles:

- **Small, focused functions**: Each function does one thing well. If a function is hard to name or explain in one sentence, it's doing too much.
- **Composability over inheritance**: Build complex behavior by composing simple functions, not through deep class hierarchies.
- **Pure functions where practical**: Prefer functions that take inputs and return outputs without side effects. Isolate side effects (DB, network, file I/O) at the edges.
- **Immutability by default**: Don't mutate data; create new values instead. This makes code easier to reason about.
- **Explicit over implicit**: Pass dependencies as arguments rather than relying on global state. Makes testing and understanding easier.

**Practical guidelines:**

- Functions should generally be 10-25 lines. If longer, look for extraction opportunities.
- Avoid deeply nested conditionals — extract helper functions or use early returns.
- Name functions as verbs describing their action: `fetchText`, `chunkParagraphs`, `embedChunks`.
- Keep `main()` functions minimal — they wire things together but don't contain logic.

This applies to both Python workers and Go API code. The goal is readable, testable, maintainable code — not FP purity.

## Input Sources

Two primary input methods:

1. **Project Gutenberg URLs**: Plain text URLs from gutenberg.org. Workers fetch the text, strip Gutenberg boilerplate (headers/footers), and process.

2. **PDF Uploads**: Users upload PDF files. Workers extract text using PyMuPDF, then process normally. PDFs stored locally in `uploads/` directory.

## Architecture

```
Ingestion API (Go)
    ↓
Redis Queue
    ↓
Python Workers (Celery)
    ↓
DuckDB (Storage)
    ↑
Query API (Go)
    ↑
React Frontend
```

## Tech Stack

- **API/Ingestion**: Go, Redis client
- **Queue**: Redis
- **Workers**: Python, Celery, Sentence-Transformers, PyMuPDF, DuckDB
- **Storage**: DuckDB
- **Frontend**: React

## Go API (main.go)

Two main responsibilities:

**Ingestion endpoints**:
- POST `/ingest` → Accepts Project Gutenberg URL and metadata (author, title, year, genre)
  - Checks if text already exists in DuckDB (by source URL or hash)
  - If text doesn't exist: creates task, pushes to Redis queue
  - Returns job ID and status
- POST `/upload` → Accepts PDF file upload (multipart/form-data) and metadata
  - Saves PDF to `uploads/` directory
  - Creates task with file path, pushes to Redis queue
  - Returns job ID and status
- GET `/ingest/status/<job_id>` → Returns job status (queued, processing, done, error)

**Query endpoints** (read-only DuckDB):
- GET `/search?q=<query>&limit=10` → Semantic search
- GET `/compare?term1=<t1>&term2=<t2>` → Semantic distance
- GET `/texts` → List all texts with metadata

API runs on localhost:8000.

DuckDB is read-only for the API; workers are the only writers.

## Python Workers (worker.py + celery_config.py)

Celery tasks that process ingested texts:

**Fetch and embed task**:
1. Receive job (source URL or PDF path, metadata)
2. Extract text:
   - **Gutenberg URL**: Fetch text, strip boilerplate headers/footers
   - **PDF file**: Extract text using PyMuPDF (fitz)
3. Chunk into paragraphs (100-2000 characters)
4. Embed each chunk with Sentence-Transformers "all-MiniLM-L6-v2"
5. Store in DuckDB: text, embedding, author, title, year, source, genre
6. Mark job as complete

**Error handling**:
- Retry on network failure (max 3 retries)
- Log errors
- Mark job as failed if unrecoverable
- Prevent duplicates on retry by checking DB before storing

## Redis Queue

Stores job messages. Workers consume from queue.

Job message format:
```json
{
  "job_id": "uuid",
  "source_type": "gutenberg" | "pdf",
  "source_url": "https://www.gutenberg.org/...",
  "pdf_path": "uploads/abc123.pdf",
  "metadata": {
    "author": "name",
    "title": "title",
    "year": 2020,
    "genre": "essay"
  }
}
```

Redis handles queue persistence and worker coordination. Celery abstracts Redis interaction.

## DuckDB Schema

```sql
CREATE TABLE texts (
  id INTEGER PRIMARY KEY,
  source_url VARCHAR,
  text VARCHAR,
  embedding FLOAT4[384],
  author VARCHAR,
  title VARCHAR,
  year INTEGER,
  genre VARCHAR,
  created_at TIMESTAMP,
  hash VARCHAR UNIQUE
);

CREATE INDEX idx_year ON texts(year);
CREATE INDEX idx_genre ON texts(genre);
```

## File Structure

```
corpus/
├── README.md
├── Claude.md
├── requirements.txt (Python dependencies)
├── go.mod, go.sum (Go dependencies)
├── package.json (React dependencies)
├── api/
│   └── main.go (ingestion and query endpoints)
├── workers/
│   ├── worker.py (Celery tasks)
│   └── celery_config.py (Celery and Redis setup)
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── ...
│   └── ...
├── uploads/ (PDF files stored here)
├── corpus.db (created by workers)
└── .gitignore
```

## Development Workflow

1. **Start Redis** (required for queue)
   ```bash
   redis-server
   ```

2. **Start workers** (pulls from queue, processes texts)
   ```bash
   python -m celery -A workers.worker worker --loglevel=info
   ```

3. **Start API** (accepts ingestion, serves queries)
   ```bash
   go run api/main.go
   ```

4. **Start frontend** (lets users interact)
   ```bash
   npm start
   ```

5. **Test ingestion**
   ```bash
   curl -X POST http://localhost:8000/ingest \
     -H "Content-Type: application/json" \
     -d '{
       "source_url": "https://example.com/text.txt",
       "metadata": {"author": "Name", "title": "Title", "year": 2020, "genre": "essay"}
     }'
   ```

   Workers will pick up the job from Redis, process asynchronously, and store in DuckDB.

## Scaling

To scale:
- Spawn more worker processes (each consumes from the same Redis queue)
- Redis handles job distribution
- Multiple workers can process texts in parallel
- DuckDB handles concurrent writes from workers (though slower than single writer; fine for now)

For massive scale, you could swap DuckDB for PostgreSQL, but it's unnecessary for 100-500 texts.

## Deployment (Future)

To move to the web:
- Host Redis on server (or use managed Redis service)
- Host DuckDB on server
- Deploy Go API binary
- Deploy Python workers as systemd service or in containers
- Deploy React build as static assets

No code changes needed. Just point everything at remote Redis and DuckDB.

 ## Typical Workflow

When working on a new feature phase:

1. **Check ROADMAP.md** - Identify the current chunk and its requirements
2. **Backend first** - Create/update service, controller, routes, Swagger docs
3. **Frontend second** - Create/update types, API client, components, pages
4. **Update documentation:**
    - Mark completed items in `ROADMAP.md`
    - Update Swagger JSDoc if API changed
    - Update Postman collection if endpoints added/changed
    - Update the scratchpad in `.claude/EXECUTION_LOG.md`
5. **Provide commit message** when requested

## Scratchpad Pattern

Maintain an execution log at `.claude/EXECUTION_LOG.md` as you work.

**During the session:** Update it as you go (not just at the end). After completing each logical step:
- Note what was just accomplished
- Mention any decisions and why
- List blockers or gotchas discovered
- Preview what's next

**At session end:** Summarize the overall progress for next session context.

Format:
- **Completed**: Brief description + files touched
- **Decisions**: Why approach X over Y
- **Blockers**: Issues, workarounds, things to revisit
- **Next**: What to tackle next time

## Multi-Claude Workflow (Writer + Reviewer)

For complex features, use multiple Claude instances for better code quality:

```
Writer Claude ──► WRITER.md ──► Reviewer Claude ──► REVIEW.md ──► Editor Claude
```

### Scratchpad Files
- `.claude/EXECUTION_LOG.md` - Ongoing session log (from Scratchpad Pattern above)
- `.claude/scratchpads/WRITER.md` - Writer documents implementation
- `.claude/scratchpads/REVIEW.md` - Reviewer documents feedback

### Setup (one-time)
```bash
mkdir -p .claude/scratchpads
```

### Workflow Steps

**Step 1: Writer Claude** (Terminal 1)
```
> "Implement [feature]. Document your work in .claude/scratchpads/WRITER.md"
```

**Step 2: Reviewer Claude** (Terminal 2 or after `/clear`)
```
> "Review [feature]. Read .claude/scratchpads/WRITER.md and the code. Write feedback to .claude/scratchpads/REVIEW.md"
```

**Step 3: Editor Claude** (fresh instance after `/clear`)
```
> "Apply the review feedback from .claude/scratchpads/REVIEW.md to [feature]. Reference .claude/scratchpads/WRITER.md for implementation context."
```

### Why This Works
- **Fresh context** prevents cognitive overload
- **Separation of concerns** mirrors human code review
- **Adversarial verification** catches issues a single context might miss

**Commit Message Format:**
```
feat: brief description

- Backend changes
- Frontend changes
- Documentation updates

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```