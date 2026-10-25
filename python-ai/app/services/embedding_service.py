import hashlib
import os
import threading
from typing import Any

from ..core.config import settings
from ..core.logging import logger

_model = None
_model_lock = threading.Lock()


def _fallback_vector(text: str, dim: int = 384) -> list[float]:
    """Create a deterministic embedding without downloading a model.

    This keeps the local app usable offline or when the embedding model is
    unavailable. The vector is stable for the same input and large enough to
    work with Chroma and retrieval code paths while preserving a safe fallback.
    """
    digest = hashlib.sha256(text.strip().lower().encode("utf-8")).digest()
    vector: list[float] = []
    for i in range(dim):
        byte_index = i % len(digest)
        value = digest[byte_index] / 255.0
        # keep the vector stable and bounded while simulating a semantic signal
        vector.append((value * 2.0) - 1.0)
    return vector


def _fallback_embedding_texts(texts: list[str]) -> list[list[float]]:
    return [_fallback_vector(text) for text in texts]


def _get_model() -> Any:
    """Lazily load the embedding model once and cache it.

    The real model is the default so retrieval quality matches the README
    (BAAI/bge-small-en-v1.5). Set LAWGPT_DISABLE_EMBEDDING_DOWNLOAD=true to
    opt out on machines that must stay offline — the deterministic fallback
    vectors keep every code path working in that mode.
    """
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                if os.getenv("LAWGPT_DISABLE_EMBEDDING_DOWNLOAD", "false").lower() in {"1", "true", "yes", "on"}:
                    logger.warning(
                        "Embedding downloads are disabled in local-safe mode; using deterministic fallback vectors."
                    )
                    _model = False
                    return None
                try:
                    from sentence_transformers import SentenceTransformer

                    _model = SentenceTransformer(settings.embedding_model)
                except Exception as exc:  # pragma: no cover - exercised in runtime envs
                    logger.warning(
                        "Unable to load embedding model %s; using fallback vectors: %s",
                        settings.embedding_model,
                        exc,
                    )
                    _model = False
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    if model in (None, False):
        return _fallback_embedding_texts(texts)

    try:
        embeddings = model.encode(texts, normalize_embeddings=True)
        return [emb.tolist() for emb in embeddings]
    except Exception as exc:
        logger.warning("Embedding generation failed; using deterministic fallback vectors: %s", exc)
        return _fallback_embedding_texts(texts)


def embed_query(query: str) -> list[float]:
    return embed_texts([query])[0]
