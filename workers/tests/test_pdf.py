"""Unit tests for PDF extraction module."""

from pathlib import Path

import pytest

from workers.pdf import clean_pdf_text, extract_and_clean, extract_pdf_text


class TestExtractPdfText:
    """Tests for extract_pdf_text function."""

    def test_extracts_text_from_simple_pdf(self, sample_pdf: Path):
        """Should extract readable text from a PDF."""
        text = extract_pdf_text(str(sample_pdf))

        assert "first paragraph" in text
        assert "second paragraph" in text

    def test_joins_multiple_pages(self, multi_page_pdf: Path):
        """Should extract and join text from all pages."""
        text = extract_pdf_text(str(multi_page_pdf))

        assert "page 1" in text
        assert "page 2" in text
        assert "page 3" in text

    def test_empty_pdf_returns_empty_string(self, empty_pdf: Path):
        """Should return empty string for PDF with no text."""
        text = extract_pdf_text(str(empty_pdf))

        assert text == ""

    def test_nonexistent_file_raises_error(self, tmp_path: Path):
        """Should raise error for missing file."""
        fake_path = tmp_path / "does_not_exist.pdf"

        with pytest.raises(Exception):  # fitz raises various errors
            extract_pdf_text(str(fake_path))


class TestCleanPdfText:
    """Tests for clean_pdf_text function."""

    def test_rejoins_hyphenated_words(self):
        """Should rejoin words split across lines with hyphens."""
        text = "This word is hyph-\nenated across lines."
        cleaned = clean_pdf_text(text)

        assert "hyphenated" in cleaned
        assert "hyph-\nenated" not in cleaned

    def test_collapses_multiple_blank_lines(self):
        """Should replace 3+ newlines with double newline."""
        text = "Paragraph one.\n\n\n\n\nParagraph two."
        cleaned = clean_pdf_text(text)

        assert "\n\n\n" not in cleaned
        assert "Paragraph one.\n\nParagraph two." == cleaned

    def test_collapses_multiple_spaces(self):
        """Should collapse multiple spaces to single space."""
        text = "Too    many   spaces   here."
        cleaned = clean_pdf_text(text)

        assert "  " not in cleaned
        assert "Too many spaces here." == cleaned

    def test_strips_leading_trailing_whitespace(self):
        """Should strip whitespace from start and end."""
        text = "   Content with whitespace.   "
        cleaned = clean_pdf_text(text)

        assert cleaned == "Content with whitespace."

    def test_cleans_spaces_around_newlines(self):
        """Should remove spaces immediately before/after newlines."""
        text = "Line one.   \n   Line two."
        cleaned = clean_pdf_text(text)

        assert " \n" not in cleaned
        assert "\n " not in cleaned


class TestExtractAndClean:
    """Tests for extract_and_clean convenience function."""

    def test_extracts_and_cleans_in_one_call(self, sample_pdf: Path):
        """Should extract text and apply cleaning."""
        text = extract_and_clean(str(sample_pdf))

        # Should have content
        assert "first paragraph" in text
        # Should be cleaned (no excessive whitespace)
        assert "   " not in text

    def test_handles_hyphenation_from_pdf(self, sample_pdf: Path):
        """Should clean hyphenation artifacts from extracted PDF."""
        text = extract_and_clean(str(sample_pdf))

        # The sample PDF has "hyph-\nenated" which should become "hyphenated"
        assert "hyphenated" in text
