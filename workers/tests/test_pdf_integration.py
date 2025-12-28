"""Integration tests for PDF processing pipeline.

Tests the flow from PDF extraction through chunking,
without requiring the ML model or database.
"""

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
import fitz

from workers.pdf import extract_and_clean
from workers.chunker import chunk_text


class TestPdfToChunksPipeline:
    """Integration tests for PDF extraction → chunking."""

    def test_real_pdf_produces_chunks(self, tmp_path: Path):
        """A PDF with substantial content should produce multiple chunks."""
        pdf_path = tmp_path / "substantial.pdf"

        # Create a PDF with enough content to produce multiple chunks
        doc = fitz.open()
        page = doc.new_page()

        # Add substantial text (multiple paragraphs, enough for chunking)
        content = """
The first paragraph contains a discussion about community
and how people interact in modern society. This explores themes
of connection and disconnection in the digital age.

The second paragraph examines institutional decay and how
traditional structures have evolved over time. It considers
the role of technology in reshaping our understanding of
organizations and governance.

The third paragraph looks at atomization, the process by which
individuals become increasingly isolated from each other and
from larger social structures. This phenomenon has accelerated
with changes in work, family, and civic life.

The fourth paragraph synthesizes these themes, arguing that
understanding these patterns is essential for building more
resilient communities and institutions in the future.
""".strip()

        page.insert_text((72, 72), content, fontsize=11)
        doc.save(str(pdf_path))
        doc.close()

        # Run the pipeline
        text = extract_and_clean(str(pdf_path))
        chunks = chunk_text(text)

        # Verify output
        assert len(text) > 0, "Should extract text from PDF"
        assert len(chunks) >= 1, "Should produce at least one chunk"

        # Verify content integrity
        assert "community" in text.lower()
        assert "institutional" in text.lower()

    def test_empty_pdf_produces_no_chunks(self, empty_pdf: Path):
        """An empty PDF should produce no chunks."""
        text = extract_and_clean(str(empty_pdf))
        chunks = chunk_text(text)

        assert text == ""
        assert chunks == []

    def test_hyphenation_cleaned_before_chunking(self, tmp_path: Path):
        """Hyphenated words should be rejoined before chunking."""
        pdf_path = tmp_path / "hyphenated.pdf"

        doc = fitz.open()
        page = doc.new_page()
        # Simulate a word split across lines in a PDF
        page.insert_text((72, 72), "The docu-\nment contains hyph-\nenated words.", fontsize=12)
        doc.save(str(pdf_path))
        doc.close()

        text = extract_and_clean(str(pdf_path))

        # Verify hyphenation was cleaned
        assert "document" in text
        assert "hyphenated" in text
        assert "docu-\n" not in text


class TestWorkerPdfRouting:
    """Tests for worker's PDF job handling logic.

    Note: We use process_text.run() which calls the task synchronously
    without Celery infrastructure, properly handling bind=True.
    """

    def test_worker_validates_pdf_path_required(self):
        """Worker should require pdf_path for pdf source_type."""
        from workers.worker import process_text

        # process_text.run() calls the task synchronously
        # Celery wraps bind=True tasks, so run() handles self injection
        with pytest.raises(ValueError, match="pdf_path required"):
            process_text.run(
                job_id="test-123",
                source_type="pdf",
                pdf_path=None,
            )

    def test_worker_validates_pdf_file_exists(self, tmp_path: Path):
        """Worker should raise error for missing PDF file."""
        from workers.worker import process_text

        fake_path = str(tmp_path / "nonexistent.pdf")

        with pytest.raises(FileNotFoundError, match="PDF file not found"):
            process_text.run(
                job_id="test-456",
                source_type="pdf",
                pdf_path=fake_path,
            )

    @patch("workers.worker.embed_chunks")
    @patch("workers.worker.store_chunks")
    def test_worker_processes_pdf_end_to_end(
        self, mock_store, mock_embed, sample_pdf: Path
    ):
        """Worker should process a valid PDF through the full pipeline."""
        from workers.worker import process_text

        # Mock the expensive operations
        mock_embed.return_value = [[0.1] * 384]  # Fake embedding
        mock_store.return_value = MagicMock(stored=1, skipped=0)

        result = process_text.run(
            job_id="test-789",
            source_type="pdf",
            pdf_path=str(sample_pdf),
            metadata={"author": "Test Author", "title": "Test Doc"},
        )

        # Verify result structure
        assert result["job_id"] == "test-789"
        assert result["status"] == "completed"
        assert result["source_type"] == "pdf"

        # Verify pipeline was called
        mock_embed.assert_called_once()
        mock_store.assert_called_once()

        # Verify metadata was passed through
        call_kwargs = mock_store.call_args.kwargs
        assert call_kwargs["author"] == "Test Author"
        assert call_kwargs["title"] == "Test Doc"
