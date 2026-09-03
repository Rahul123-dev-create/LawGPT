from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import analysis, arguments, chat, documents, research
from .core.config import settings
from .core.logging import logger, setup_logging
from .services.judgment_service import judgment_service

setup_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    judgment_service.initialize_and_index()
    logger.info("LawGPT AI service started (embedding model: %s)", settings.embedding_model)
    yield
    logger.info("LawGPT AI service stopped")


app = FastAPI(
    title="LawGPT AI Service",
    description="Document processing pipeline (OCR → extraction → chunking → embeddings → vector store) "
    "and retrieval infrastructure for LawGPT. Stateless per request.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(analysis.router)
app.include_router(arguments.router)
app.include_router(chat.router)
app.include_router(research.router)


@app.get("/health", summary="Liveness probe")
def health():
    return {"success": True, "message": "LawGPT AI service is running"}

