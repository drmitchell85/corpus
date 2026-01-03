"""Gutenberg text fetching and boilerplate stripping."""

import re
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def _get_retry_session() -> requests.Session:
    """Create a requests session with automatic retry logic.

    Retry strategy:
    - 3 retries total (4 attempts including initial request)
    - Exponential backoff: {backoff factor} * (2 ^ {retry number}) seconds
    - Retry on network errors and specific HTTP status codes
    - Backoff factor: 1 second (waits: 0s, 2s, 4s for retries 0, 1, 2)

    Returns:
        Configured requests Session with retry adapter
    """
    retry_strategy = Retry(
        total=3,  # Total number of retries
        backoff_factor=1,  # Wait 1s, 2s, 4s between retries
        status_forcelist=[408, 429, 500, 502, 503, 504],  # Retry these HTTP codes
        allowed_methods=["GET"],  # Only retry GET requests
        raise_on_status=False,  # Let retries complete; we call raise_for_status() after
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session = requests.Session()
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def fetch_gutenberg_text(url: str, timeout: tuple[float, float | None] = (5, 30)) -> str:
    """Fetch text content from a Project Gutenberg URL.

    HTTP-level retries: 3 attempts with exponential backoff for network/server errors
    (408, 429, 500, 502, 503, 504). This handles transient issues at the HTTP layer
    before the Celery task-level retry kicks in.

    Args:
        url: URL to a Gutenberg plain text file
        timeout: Tuple of (connect_timeout, read_timeout) in seconds.
                 Supports sub-second precision (e.g., 0.5) and None for infinite read.
                 Default (5, 30) fails fast on connection issues but allows
                 slow downloads of large texts.

    Returns:
        Raw text content from the URL

    Raises:
        requests.ConnectionError: If network connection fails (retryable)
        requests.Timeout: If request times out (retryable)
        requests.HTTPError: If server returns error status (may be retryable)
        ValueError: If URL is invalid (not retryable)
    """
    session = _get_retry_session()
    try:
        response = session.get(url, timeout=timeout)
        response.raise_for_status()
        return response.text
    except requests.exceptions.MissingSchema as exc:
        # Invalid URL format (e.g., missing http://)
        raise ValueError(f"Invalid URL format: {url}") from exc
    except requests.exceptions.InvalidURL as exc:
        # Malformed URL
        raise ValueError(f"Malformed URL: {url}") from exc
    # Let ConnectionError, Timeout, HTTPError propagate naturally
    finally:
        session.close()


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
