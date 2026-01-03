"""Text embedding utilities using sentence-transformers."""

import logging
import time
from sentence_transformers import SentenceTransformer
import numpy as np

logger = logging.getLogger(__name__)

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
        start_time = time.time()
        logger.info("Loading sentence transformer model", extra={"model_name": MODEL_NAME})

        try:
            _model = SentenceTransformer(MODEL_NAME)
            load_duration_ms = int((time.time() - start_time) * 1000)
            logger.info(
                "Model loaded successfully",
                extra={
                    "model_name": MODEL_NAME,
                    "embedding_dim": EMBEDDING_DIM,
                    "duration_ms": load_duration_ms,
                }
            )
        except OSError as exc:
            # Model file not found, download failed, disk I/O error
            logger.error(
                "Failed to load model - OSError",
                extra={"model_name": MODEL_NAME, "error": str(exc)},
                exc_info=True
            )
            raise RuntimeError(f"Failed to load model '{MODEL_NAME}': {exc}") from exc
        except (ImportError, ModuleNotFoundError) as exc:
            # Missing dependencies (torch, transformers, etc.)
            logger.error(
                "Failed to load model - missing dependencies",
                extra={"model_name": MODEL_NAME, "error": str(exc)},
                exc_info=True
            )
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
        logger.debug("No chunks to embed")
        return []

    start_time = time.time()
    chunk_count = len(chunks)
    total_chars = sum(len(chunk) for chunk in chunks)

    logger.debug(
        "Starting batch embedding",
        extra={
            "chunk_count": chunk_count,
            "total_chars": total_chars,
            "avg_chars_per_chunk": total_chars // chunk_count,
        }
    )

    # Validate all chunks are non-empty (consistent with embed_text)
    for i, chunk in enumerate(chunks):
        if not chunk or not chunk.strip():
            logger.error(
                "Empty chunk found",
                extra={"chunk_index": i, "chunk_count": chunk_count}
            )
            raise ValueError(f"Chunk at index {i} is empty or whitespace-only")

    model = get_model()
    embeddings = model.encode(chunks, convert_to_numpy=True)

    # Validate model returned correct number of embeddings
    if len(embeddings) != len(chunks):
        logger.error(
            "Embedding count mismatch",
            extra={
                "expected_count": chunk_count,
                "actual_count": len(embeddings),
            }
        )
        raise RuntimeError(
            f"Model returned {len(embeddings)} embeddings for {len(chunks)} chunks"
        )

    duration_ms = int((time.time() - start_time) * 1000)
    # Avoid division by zero for very fast operations
    throughput_chunks_per_sec = (chunk_count / (duration_ms / 1000)) if duration_ms > 0 else (chunk_count * 1000)

    logger.info(
        "Batch embedding completed",
        extra={
            "chunk_count": chunk_count,
            "total_chars": total_chars,
            "duration_ms": duration_ms,
            "throughput_chunks_per_sec": round(throughput_chunks_per_sec, 2),
            "avg_ms_per_chunk": round(duration_ms / chunk_count, 2) if chunk_count > 0 else 0,
        }
    )

    # model.encode returns 2D array for multiple inputs
    return [embeddings[i] for i in range(len(chunks))]
