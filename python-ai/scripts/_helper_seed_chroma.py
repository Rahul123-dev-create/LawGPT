"""
_helper_seed_chroma.py — Seed ChromaDB from MongoDB DocumentPage records for a specific case/document.
This script is invoked by the Node.js pipeline runner to guarantee Module 8 (chat) has embeddings.

Usage (called internally via subprocess from within runFullPipelineTest.js):
  .\\venv\\Scripts\\python.exe scripts\\_helper_seed_chroma.py <caseId> <docId> [documentName]

Output: prints JSON { "upserted": N, "status": "ok" } on success, non-zero exit on failure.
"""
from __future__ import annotations

import json
import os
import sys

# Ensure the script is run with the venv that has sentence-transformers installed:
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))

from app.services import chunking_service, embedding_service, vectorstore_service  # noqa: E402
from app.core.logging import logger  # noqa: E402


def _paginate_to_chunks(case_id: str, document_id: str, document_name: str, pages: list[dict]) -> list[dict]:
    """Convert (pageNumber, text) pairs into page-aware, provenance-carrying chunks
    using the exact same chunking pipeline the backend uses. """
    normalized_pages = [
        {"pageNumber": int(p["pageNumber"]), "text": p["text"]}
        for p in pages
        if isinstance(p.get("text"), str) and p["text"].strip()
    ]
    return chunking_service.chunk_pages(normalized_pages)


def seed_for_document(case_id: str, document_id: str, document_name: str, pages: list[dict]) -> dict:
    chunks = _paginate_to_chunks(case_id, document_id, document_name, pages)
    if not chunks:
        return {"upserted": 0, "skipped": True, "reason": "no chunkable pages"}

    texts = [c["text"] for c in chunks]
    embeddings = embedding_service.embed_texts(texts)

    vectorstore_service.delete_document_chunks(document_id)
    vectorstore_service.upsert_chunks(
        chunks,
        embeddings,
        metadata={
            "caseId": case_id,
            "documentId": document_id,
            "documentName": document_name,
            "docType": "petition",
        },
    )
    return {"upserted": len(chunks), "totalChars": sum(len(t) for t in texts)}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: _helper_seed_chroma.py caseId docId [docName] [pagesJsonFile]"}))
        sys.exit(2)

    case_id = sys.argv[1]
    doc_id = sys.argv[2]
    doc_name = sys.argv[3] if len(sys.argv) > 3 else "ViewLetterDoc.pdf"

    # Optional fourth argument: path to JSON file that stores [{pageNumber, text}]
    # (the Node script writes this file to avoid re-querying MongoDB from Python).
    if len(sys.argv) > 4 and os.path.exists(sys.argv[4]):
        with open(sys.argv[4], "r", encoding="utf-8") as f:
            pages = json.load(f)
    else:
        # Fallback: go query MongoDB ourselves (requires pymongo in the venv)
        try:
            from pymongo import MongoClient
            from bson import ObjectId
        except Exception as exc:  # pragma: no cover
            print(json.dumps({"error": f"pymongo unavailable and no pagesJsonFile supplied: {exc}"}))
            sys.exit(3)
        from app.core.config import settings
        mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/lawgpt")
        client = MongoClient(mongo_uri)
        db = client.get_default_database()
        raw = list(
            db["documentpages"]
            .find({"documentId": ObjectId(doc_id)})
            .sort("pageNumber", 1)
        )
        pages = [{"pageNumber": p["pageNumber"], "text": p["text"]} for p in raw if p.get("text")]
        client.close()

    try:
        result = seed_for_document(case_id, doc_id, doc_name, pages)
        logger.info("Chroma seeded for case=%s doc=%s: %s", case_id, doc_id, result)
        print(json.dumps({"status": "ok", **result}))
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
