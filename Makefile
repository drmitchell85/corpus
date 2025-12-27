.PHONY: install init-db test worker clean

install:
	pip install -r requirements.txt

init-db:
	python -m workers.db

test:
	python test_ingest.py

worker:
	celery -A workers.worker worker --loglevel=info

clean:
	rm -f corpus.db
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
