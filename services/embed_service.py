"""FastAPI embedding service for the Go API to call.

Run with: uvicorn services.embed_service:app --host 0.0.0.0 --port 8001
"""

import os
import sys
from pathlib import Path

# Add parent directory to path so we can import from workers
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from workers.embedder import embed_text, EMBEDDING_DIM

app = FastAPI(title="Corpus Embedding Service")


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimension: int


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


@app.get("/health", response_model=HealthResponse)
def health():
    """Health check endpoint."""
    from workers.embedder import _model
    return HealthResponse(
        status="ok",
        model_loaded=_model is not None
    )


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    """Embed a text string and return the vector."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    embedding = embed_text(req.text)

    return EmbedResponse(
        embedding=embedding.tolist(),
        dimension=EMBEDDING_DIM
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("EMBED_SERVICE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
