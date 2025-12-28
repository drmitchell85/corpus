VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest

.PHONY: install init-db test test-e2e test-all worker api embed clean

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
	cd api && go build -o corpus-api ./cmd && ./corpus-api

clean:
	rm -f corpus.db api/corpus-api
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(VENV) .pytest_cache
