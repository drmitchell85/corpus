"""PDF text extraction using PyMuPDF."""

import logging
import os
import re
import time
import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


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
    start_time = time.time()
    logger.debug("Starting PDF extraction", extra={"pdf_path": pdf_path})

    # Explicitly check file existence (PyMuPDF may not raise standard FileNotFoundError)
    if not os.path.isfile(pdf_path):
        logger.error(
            "PDF file not found",
            extra={"pdf_path": pdf_path}
        )
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    # Get file size for logging
    file_size = os.path.getsize(pdf_path)

    try:
        doc = fitz.open(pdf_path)
    except fitz.FileDataError as exc:
        # Corrupt or invalid PDF file - not retryable
        logger.error(
            "Corrupt or invalid PDF file",
            extra={
                "pdf_path": pdf_path,
                "file_size_bytes": file_size,
                "error": str(exc),
            }
        )
        raise ValueError(f"Corrupt or invalid PDF file: {pdf_path}") from exc

    try:
        page_count = len(doc)
        logger.debug(
            "PDF opened successfully",
            extra={
                "pdf_path": pdf_path,
                "page_count": page_count,
                "file_size_bytes": file_size,
            }
        )

        pages = []
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text()
            if text.strip():
                pages.append(text)
                logger.debug(
                    "Extracted page",
                    extra={
                        "pdf_path": pdf_path,
                        "page_num": page_num,
                        "char_count": len(text),
                    }
                )

        extracted_text = "\n\n".join(pages)
        duration_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "PDF extraction successful",
            extra={
                "pdf_path": pdf_path,
                "page_count": page_count,
                "pages_with_text": len(pages),
                "total_chars": len(extracted_text),
                "duration_ms": duration_ms,
            }
        )

        return extracted_text
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
