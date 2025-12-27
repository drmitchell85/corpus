"""Text chunking utilities for embedding preparation."""

import re

# Chunk size constraints
MIN_CHUNK_SIZE = 100
MAX_CHUNK_SIZE = 2000


def split_into_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs.

    Paragraphs are separated by one or more blank lines.

    Args:
        text: Input text

    Returns:
        List of non-empty paragraphs
    """
    # Split on two or more newlines (handles \n\n, \r\n\r\n, etc.)
    paragraphs = re.split(r'\n\s*\n', text)

    # Clean up whitespace and filter empty paragraphs
    return [p.strip() for p in paragraphs if p.strip()]


def split_long_paragraph(paragraph: str, max_size: int = MAX_CHUNK_SIZE) -> list[str]:
    """Split a long paragraph into smaller chunks.

    Tries to split at sentence boundaries first, then falls back to
    word boundaries if sentences are too long.

    Args:
        paragraph: Text to split
        max_size: Maximum chunk size

    Returns:
        List of chunks
    """
    if len(paragraph) <= max_size:
        return [paragraph]

    chunks = []
    current_chunk = ""

    # Split into sentences (handles ., !, ?)
    sentences = re.split(r'(?<=[.!?])\s+', paragraph)

    for sentence in sentences:
        # If single sentence exceeds max, split on words
        if len(sentence) > max_size:
            # Flush current chunk first
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ""

            # Split long sentence on word boundaries
            words = sentence.split()
            for word in words:
                if len(current_chunk) + len(word) + 1 > max_size:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = word
                else:
                    current_chunk = f"{current_chunk} {word}" if current_chunk else word

        # Normal case: add sentence to current chunk
        elif len(current_chunk) + len(sentence) + 1 > max_size:
            chunks.append(current_chunk.strip())
            current_chunk = sentence
        else:
            current_chunk = f"{current_chunk} {sentence}" if current_chunk else sentence

    # Don't forget the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


def chunk_text(text: str, min_size: int = MIN_CHUNK_SIZE,
               max_size: int = MAX_CHUNK_SIZE) -> list[str]:
    """Split text into chunks suitable for embedding.

    Uses paragraph-aware splitting:
    1. Split into paragraphs
    2. Merge small paragraphs together
    3. Split large paragraphs at sentence/word boundaries

    Args:
        text: Input text to chunk
        min_size: Minimum chunk size (default 100)
        max_size: Maximum chunk size (default 2000)

    Returns:
        List of text chunks
    """
    paragraphs = split_into_paragraphs(text)

    if not paragraphs:
        return []

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        # Handle paragraphs that exceed max size
        if len(para) > max_size:
            # First, flush any accumulated content
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""

            # Split the long paragraph and add pieces
            sub_chunks = split_long_paragraph(para, max_size)
            chunks.extend(sub_chunks)
            continue

        # Would adding this paragraph exceed max?
        combined_len = len(current_chunk) + len(para) + 2  # +2 for "\n\n"

        if combined_len > max_size and current_chunk:
            # Flush current chunk and start fresh
            chunks.append(current_chunk)
            current_chunk = para
        else:
            # Merge with current chunk
            if current_chunk:
                current_chunk = f"{current_chunk}\n\n{para}"
            else:
                current_chunk = para

    # Flush remaining content
    if current_chunk:
        chunks.append(current_chunk)

    # Filter out chunks that are too small (unless it's all we have)
    if len(chunks) > 1:
        chunks = [c for c in chunks if len(c) >= min_size]

    return chunks
