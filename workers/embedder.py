"""Text embedding utilities using sentence-transformers."""

from sentence_transformers import SentenceTransformer
import numpy as np

# Model configuration
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

# Lazy-loaded model instance
_model = None


def get_model() -> SentenceTransformer:
    """Get the sentence transformer model (lazy loading).

    Returns:
        Loaded SentenceTransformer model

    Raises:
        RuntimeError: If model fails to load (network, disk, or dependency issues)
    """
    global _model
    if _model is None:
        try:
            _model = SentenceTransformer(MODEL_NAME)
        except OSError as exc:
            # Model file not found, download failed, disk I/O error
            raise RuntimeError(f"Failed to load model '{MODEL_NAME}': {exc}") from exc
        except (ImportError, ModuleNotFoundError) as exc:
            # Missing dependencies (torch, transformers, etc.)
            raise RuntimeError(f"Model dependencies missing for '{MODEL_NAME}': {exc}") from exc
    return _model


def embed_text(text: str) -> np.ndarray:
    """Embed a single text string.

    Args:
        text: Text to embed

    Returns:
        384-dimensional numpy array

    Raises:
        ValueError: If text is empty or whitespace-only
    """
    if not text or not text.strip():
        raise ValueError("Cannot embed empty text")

    model = get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding


def embed_chunks(chunks: list[str]) -> list[np.ndarray]:
    """Embed multiple text chunks in batch.

    Batch processing is more efficient than embedding one at a time.

    Args:
        chunks: List of text chunks to embed

    Returns:
        List of 384-dimensional numpy arrays

    Raises:
        ValueError: If any chunk is empty or whitespace-only
        RuntimeError: If model returns mismatched number of embeddings
    """
    if not chunks:
        return []

    # Validate all chunks are non-empty (consistent with embed_text)
    for i, chunk in enumerate(chunks):
        if not chunk or not chunk.strip():
            raise ValueError(f"Chunk at index {i} is empty or whitespace-only")

    model = get_model()
    embeddings = model.encode(chunks, convert_to_numpy=True)

    # Validate model returned correct number of embeddings
    if len(embeddings) != len(chunks):
        raise RuntimeError(
            f"Model returned {len(embeddings)} embeddings for {len(chunks)} chunks"
        )

    # model.encode returns 2D array for multiple inputs
    return [embeddings[i] for i in range(len(chunks))]
