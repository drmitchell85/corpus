"""Shared test fixtures for workers tests."""

import tempfile
from pathlib import Path

import fitz  # PyMuPDF
import pytest


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    """Create a simple test PDF with known content.

    Uses PyMuPDF to programmatically generate a PDF, ensuring
    tests are self-contained and reproducible.

    Returns:
        Path to the generated PDF file
    """
    pdf_path = tmp_path / "test_document.pdf"

    doc = fitz.open()

    # Page 1: Simple paragraph
    page1 = doc.new_page()
    page1.insert_text(
        (72, 72),  # 1 inch margins
        "This is the first paragraph of test content.\n\n"
        "This is the second paragraph with more text.",
        fontsize=12,
    )

    # Page 2: Content with hyphenation artifact
    page2 = doc.new_page()
    page2.insert_text(
        (72, 72),
        "This page contains a hyph-\nenated word that spans lines.\n\n"
        "And    extra   spaces   between   words.",
        fontsize=12,
    )

    doc.save(str(pdf_path))
    doc.close()

    return pdf_path


@pytest.fixture
def empty_pdf(tmp_path: Path) -> Path:
    """Create a PDF with no text content.

    Useful for testing edge cases with empty documents.
    """
    pdf_path = tmp_path / "empty.pdf"

    doc = fitz.open()
    doc.new_page()  # Add blank page
    doc.save(str(pdf_path))
    doc.close()

    return pdf_path


@pytest.fixture
def multi_page_pdf(tmp_path: Path) -> Path:
    """Create a PDF with multiple pages of content.

    Useful for testing page iteration and content joining.
    """
    pdf_path = tmp_path / "multi_page.pdf"

    doc = fitz.open()

    for i in range(3):
        page = doc.new_page()
        page.insert_text(
            (72, 72),
            f"Content from page {i + 1}.",
            fontsize=12,
        )

    doc.save(str(pdf_path))
    doc.close()

    return pdf_path
