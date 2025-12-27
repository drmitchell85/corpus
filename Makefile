VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

.PHONY: install init-db test worker clean

$(VENV)/bin/activate:
	python3 -m venv $(VENV)

install: $(VENV)/bin/activate
	$(PIP) install -r requirements.txt

init-db: install
	$(PYTHON) -m workers.db

test: install
	$(PYTHON) test_ingest.py

worker: install
	$(VENV)/bin/celery -A workers.worker worker --loglevel=info

clean:
	rm -f corpus.db
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(VENV)
