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
    """
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_text(text: str) -> np.ndarray:
    """Embed a single text string.

    Args:
        text: Text to embed

    Returns:
        384-dimensional numpy array
    """
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
    """
    if not chunks:
        return []

    model = get_model()
    embeddings = model.encode(chunks, convert_to_numpy=True)

    # model.encode returns 2D array for multiple inputs
    return [embeddings[i] for i in range(len(chunks))]
