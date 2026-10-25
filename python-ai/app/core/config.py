from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Service
    port: int = 8000
    backend_service_url: str = "http://localhost:5000"

    # Embeddings
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # Vector store (Chroma persistent client). Gitignored; regenerable from
    # MongoDB DocumentPage records if ever wiped.
    chroma_persist_dir: str = "./vectorstore"
    chroma_collection: str = "lawgpt_documents"

    # Module 5 Phase 3 — LLM provider for case analysis. "stub" is the
    # default because local development and verification should not depend on a
    # live Gemini quota or API key. Set to "gemini" only when a valid key is
    # configured and you want live generation.
    llm_provider: str = "stub"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Comma-separated list of fallback models to rotate through on 429 / 503 errors
    gemini_models: str = (
        "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.0-flash-lite,gemini-2.5-pro"
    )

    @property
    def gemini_model_list(self) -> list[str]:
        """Parses gemini_models string and ensures primary gemini_model is first, filtering out retired versions."""
        raw_models = [m.strip() for m in self.gemini_models.split(",") if m.strip()]
        primary = self.gemini_model.strip()
        
        ordered = []
        # Keep primary model first if valid, then append fallback choices avoiding duplicates
        for m in ([primary] if primary and "1.5" not in primary else []) + raw_models:
            if m not in ordered:
                ordered.append(m)
        return ordered or ["gemini-2.5-flash", "gemini-2.0-flash"]
    # Analysis retrieval knob (English-only grounding). The embedding model
    # (BAAI/bge-small-en-v1.5) is English-oriented, so retrieval is ONLY used
    # as optional grounding for English corpora and is always bypassed when
    # Kannada script is detected in the case text.
    analysis_use_retrieval: bool = True
    analysis_top_k: int = 8

    # Pipeline knobs
    ocr_min_text_chars: int = 25
    ocr_raster_dpi: int = 200
    # Path to the Tesseract OCR binary. Many systems need this set explicitly
    # (e.g. a portable/side-installed tesseract); defaults to the PATH lookup.
    tesseract_cmd: str = "tesseract"
    # Tesseract OCR language(s): "eng" default; "kan" (or "kan+eng" for mixed
    # documents) for Kannada — requires the matching traineddata, installed on
    # Ubuntu via the "tesseract-ocr-kan" package (the language code is "kan").
    ocr_lang: str = "eng"
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # CORS — the backend (and the frontend, when debugging the AI service
    # directly) are the only expected callers.
    cors_origins: list[str] = ["http://localhost:5000", "http://localhost:5173"]

    class Config:
        env_file = ".env"


settings = Settings()
