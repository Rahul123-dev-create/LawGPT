import os

# Force local-safe defaults before any app module is imported.
os.environ.setdefault("LLM_PROVIDER", "stub")
os.environ.setdefault("LAWGPT_DISABLE_EMBEDDING_DOWNLOAD", "true")
os.environ.setdefault("CHROMA_PERSIST_DIR", "./vectorstore-test")
