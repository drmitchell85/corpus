"""HTML text extraction using readability-lxml."""

import logging
import re
import time
from lxml import html as lxml_html
from lxml_html_clean import Cleaner
from readability import Document

logger = logging.getLogger(__name__)

# Maximum HTML size to prevent memory exhaustion attacks
MAX_HTML_SIZE = 10_000_000  # 10MB


def extract_html_text(html: str, url: str = None) -> tuple[str, str]:
    """Extract article text and title from HTML using Readability.

    Uses the Python port of Mozilla's Readability.js algorithm to extract
    the main article content from HTML, removing boilerplate (navigation,
    ads, sidebars, etc.).

    IMPORTANT: This function performs HTML entity decoding. If you render
    the extracted text in HTML (e.g., search results), you MUST escape it
    to prevent XSS vulnerabilities.

    Args:
        html: Raw HTML content (must be valid UTF-8 string)
        url: Optional source URL (used for link resolution in Readability)

    Returns:
        Tuple of (cleaned_text, title)
        - cleaned_text: Extracted article text with HTML tags stripped
        - title: Extracted article title (empty string if not found)

    Raises:
        TypeError: If html is not a string
        ValueError: If HTML is empty, too large, or extraction produces no content
    """
    start_time = time.time()

    # P2-2: Validate input type
    if not isinstance(html, str):
        raise TypeError(f"HTML must be str, got {type(html).__name__}")

    # P1-1: Validate input size to prevent memory exhaustion
    if len(html) > MAX_HTML_SIZE:
        logger.error(
            "HTML input too large",
            extra={"html_length": len(html), "max_size": MAX_HTML_SIZE}
        )
        raise ValueError(f"HTML too large: {len(html)} bytes (max {MAX_HTML_SIZE})")

    logger.debug(
        "Starting HTML extraction",
        extra={
            "html_length": len(html),
            "has_url": url is not None,
        }
    )

    if not html or not html.strip():
        logger.error("Empty HTML provided for extraction")
        raise ValueError("HTML content cannot be empty")

    try:
        # Readability document extraction
        doc = Document(html, url=url)
        title = doc.title()
        content_html = doc.summary()

        # P2-3: Warn if title is empty (may indicate extraction failure)
        if not title:
            logger.warning(
                "Readability extracted empty title",
                extra={"url": url, "html_length": len(html)}
            )

        # P1-2: Use lxml's built-in cleaner instead of regex (avoids ReDoS)
        cleaner = Cleaner(
            scripts=True,
            javascript=True,
            style=True,
            comments=True,
            page_structure=True,  # Remove <head>, <link>, <meta> for cleaner processing
            remove_tags=['script', 'style'],
        )
        content_html = cleaner.clean_html(content_html)

        # P2-1: Use lxml's text_content() instead of regex (faster, safer)
        try:
            tree = lxml_html.fromstring(content_html)
            text = tree.text_content()
        except (lxml_html.etree.XMLSyntaxError, lxml_html.etree.ParserError) as parse_exc:
            # Fallback to simple tag stripping if lxml parsing fails
            logger.warning(
                "lxml parsing failed, using fallback tag removal",
                extra={"error": str(parse_exc)}
            )
            text = re.sub(r'<[^>]+>', '', content_html)

        # Clean up whitespace (order matters!)
        text = re.sub(r'[ \t]+', ' ', text)  # Collapse spaces first
        text = re.sub(r' *\n *', '\n', text)  # Clean spaces around newlines
        text = re.sub(r'\n{3,}', '\n\n', text)  # Max 2 consecutive newlines
        text = text.strip()

        duration_ms = int((time.time() - start_time) * 1000)

        if not text:
            logger.warning(
                "HTML extraction produced empty text",
                extra={
                    "html_length": len(html),
                    "title": title,
                    "duration_ms": duration_ms,
                }
            )
            raise ValueError("HTML extraction produced no text content")

        logger.info(
            "HTML extraction successful",
            extra={
                "html_length": len(html),
                "extracted_chars": len(text),
                "title": title,
                "title_length": len(title),
                "duration_ms": duration_ms,
            }
        )

        return (text, title)

    except (TypeError, ValueError):
        # Re-raise validation errors as-is
        raise

    except MemoryError as exc:
        # Explicit handling of memory exhaustion
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "HTML extraction failed with memory error",
            extra={
                "html_length": len(html),
                "error": str(exc),
                "duration_ms": duration_ms,
            },
            exc_info=True
        )
        raise ValueError(f"HTML too complex to process: {exc}") from exc

    except Exception as exc:
        # Unexpected errors during extraction
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(
            "HTML extraction failed with unexpected error",
            extra={
                "html_length": len(html),
                "error_type": type(exc).__name__,
                "error": str(exc),
                "duration_ms": duration_ms,
            },
            exc_info=True
        )
        raise ValueError(f"HTML extraction failed: {exc}") from exc


def extract_and_clean(html: str, url: str = None) -> tuple[str, str]:
    """Extract and clean text from HTML.

    Convenience function that wraps extract_html_text.

    Args:
        html: Raw HTML content (must be valid UTF-8 string)
        url: Optional source URL

    Returns:
        Tuple of (cleaned_text, title)

    Raises:
        TypeError: If html is not a string
        ValueError: If HTML is empty, too large, or extraction fails
    """
    return extract_html_text(html, url)
