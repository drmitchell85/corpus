"""PDF text extraction using PyMuPDF."""

import os
import re
import fitz  # PyMuPDF


def extract_pdf_text(pdf_path: str) -> str:
    """Extract text content from a PDF file.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        Raw text content from all pages

    Raises:
        FileNotFoundError: If the PDF file doesn't exist (not retryable)
        ValueError: If the file is corrupt or not a valid PDF (not retryable)
    """
    # Explicitly check file existence (PyMuPDF may not raise standard FileNotFoundError)
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    try:
        doc = fitz.open(pdf_path)
    except fitz.FileDataError as exc:
        # Corrupt or invalid PDF file - not retryable
        raise ValueError(f"Corrupt or invalid PDF file: {pdf_path}") from exc

    try:
        pages = []
        for page in doc:
            text = page.get_text()
            if text.strip():
                pages.append(text)
        return "\n\n".join(pages)
    finally:
        doc.close()


def clean_pdf_text(text: str) -> str:
    """Clean common PDF extraction artifacts.

    Handles:
    - Excessive whitespace and blank lines
    - Hyphenated line breaks (recon-\nnect -> reconnect)
    - Multiple spaces collapsed to single space

    Args:
        text: Raw text extracted from PDF

    Returns:
        Cleaned text suitable for chunking
    """
    # Rejoin hyphenated words split across lines
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)

    # Replace multiple blank lines with double newline (paragraph break)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Collapse multiple spaces to single space
    text = re.sub(r"[ \t]+", " ", text)

    # Clean up spaces around newlines
    text = re.sub(r" *\n *", "\n", text)

    return text.strip()


def extract_and_clean(pdf_path: str) -> str:
    """Extract text from PDF and clean it.

    Convenience function that combines extraction and cleaning.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        Cleaned text content from the PDF
    """
    raw_text = extract_pdf_text(pdf_path)
    return clean_pdf_text(raw_text)
