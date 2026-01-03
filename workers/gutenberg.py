"""Gutenberg text fetching and boilerplate stripping."""

import re
import requests


def fetch_gutenberg_text(url: str, timeout: int = 30) -> str:
    """Fetch text content from a Project Gutenberg URL.

    Args:
        url: URL to a Gutenberg plain text file
        timeout: Request timeout in seconds

    Returns:
        Raw text content from the URL

    Raises:
        requests.ConnectionError: If network connection fails (retryable)
        requests.Timeout: If request times out (retryable)
        requests.HTTPError: If server returns error status (may be retryable)
        ValueError: If URL is invalid (not retryable)
    """
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        return response.text
    except requests.exceptions.MissingSchema as exc:
        # Invalid URL format (e.g., missing http://)
        raise ValueError(f"Invalid URL format: {url}") from exc
    except requests.exceptions.InvalidURL as exc:
        # Malformed URL
        raise ValueError(f"Malformed URL: {url}") from exc
    # Let ConnectionError, Timeout, HTTPError propagate naturally


def strip_gutenberg_boilerplate(text: str) -> str:
    """Remove Project Gutenberg header and footer boilerplate.

    Gutenberg texts have standard markers:
    - Header ends with: "*** START OF THE PROJECT GUTENBERG EBOOK"
    - Footer starts with: "*** END OF THE PROJECT GUTENBERG EBOOK"

    Args:
        text: Raw text from Gutenberg

    Returns:
        Text with header and footer removed
    """
    # Pattern for start marker (case-insensitive, flexible whitespace)
    start_pattern = re.compile(
        r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*",
        re.IGNORECASE | re.DOTALL
    )

    # Pattern for end marker
    end_pattern = re.compile(
        r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK",
        re.IGNORECASE
    )

    # Find start marker and remove everything before it
    start_match = start_pattern.search(text)
    if start_match:
        text = text[start_match.end():]

    # Find end marker and remove everything after it
    end_match = end_pattern.search(text)
    if end_match:
        text = text[:end_match.start()]

    return text.strip()


def fetch_and_clean(url: str) -> str:
    """Fetch a Gutenberg text and strip boilerplate.

    Convenience function that combines fetching and cleaning.

    Args:
        url: URL to a Gutenberg plain text file

    Returns:
        Cleaned text content
    """
    raw_text = fetch_gutenberg_text(url)
    return strip_gutenberg_boilerplate(raw_text)
