VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest

.PHONY: install init-db test test-e2e test-all worker api embed clean \
        frontend-install frontend-dev frontend-build frontend-lint frontend-preview dev

$(VENV)/bin/activate:
	python3 -m venv $(VENV)

install: $(VENV)/bin/activate
	$(PIP) install -r requirements.txt

init-db: install
	$(PYTHON) -m workers.db

# Fast unit/integration tests (no network, no ML model)
test: install
	$(PYTEST) workers/tests/ -v

# Slow end-to-end test (fetches from Gutenberg, loads ML model)
test-e2e: install
	$(PYTHON) test_ingest.py

# Run all tests
test-all: test test-e2e

worker: install
	$(VENV)/bin/celery -A workers.worker worker --loglevel=info

embed: install
	$(VENV)/bin/uvicorn services.embed_service:app --host 0.0.0.0 --port 8001

api:
	cd api && go build -o corpus-api ./cmd && DATABASE_PATH=../corpus.db UPLOAD_PATH=../uploads ./corpus-api

# Frontend commands
frontend-install:
	cd frontend && npm install

frontend-dev: frontend-install
	cd frontend && npm run dev

frontend-build: frontend-install
	cd frontend && npm run build

frontend-lint: frontend-install
	cd frontend && npm run lint

frontend-preview: frontend-build
	cd frontend && npm run preview

# Development environment instructions
dev:
	@echo "╔════════════════════════════════════════════════════════════╗"
	@echo "║              Corpus Development Environment                ║"
	@echo "╠════════════════════════════════════════════════════════════╣"
	@echo "║ Run these commands in separate terminals:                  ║"
	@echo "║                                                            ║"
	@echo "║   1. Redis (required for Celery):                          ║"
	@echo "║      redis-server                                          ║"
	@echo "║                                                            ║"
	@echo "║   2. Embedding service (port 8001):                        ║"
	@echo "║      make embed                                            ║"
	@echo "║                                                            ║"
	@echo "║   3. Celery worker:                                        ║"
	@echo "║      make worker                                           ║"
	@echo "║                                                            ║"
	@echo "║   4. Go API server (port 8080):                            ║"
	@echo "║      make api                                              ║"
	@echo "║                                                            ║"
	@echo "║   5. Frontend dev server (port 5173):                      ║"
	@echo "║      make frontend-dev                                     ║"
	@echo "║                                                            ║"
	@echo "╠════════════════════════════════════════════════════════════╣"
	@echo "║ First-time setup:                                          ║"
	@echo "║   make install          # Python dependencies              ║"
	@echo "║   make frontend-install # Node dependencies                ║"
	@echo "║   make init-db          # Initialize SQLite database       ║"
	@echo "╚════════════════════════════════════════════════════════════╝"

clean:
	rm -f corpus.db api/corpus-api
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(VENV) .pytest_cache
	rm -rf frontend/dist frontend/node_modules
