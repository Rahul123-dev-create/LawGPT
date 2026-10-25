"""Ground-truth validation for conversational RAG."""

import pytest

from app.services import chat_service


def test_distance_conversion_respects_collection_metric():
    """The document collection is squared-L2 over normalized vectors, so a
    distance of 0.7 is ~65% similar — not 30%. Treating it as cosine silently
    dropped every real hit from chat citations."""
    assert chat_service._distance_to_similarity(0.7066, "l2") == pytest.approx(0.6467, abs=1e-3)
    assert chat_service._distance_to_similarity(0.12, "l2") == pytest.approx(0.94, abs=1e-6)
    assert chat_service._distance_to_similarity(0.12, "cosine") == pytest.approx(0.88, abs=1e-6)
    assert chat_service._distance_to_similarity(None, "l2") == 0.0


def test_weak_retrieval_hits_are_dropped():
    class FakeCollection:
        # Explicit cosine space — the fixture's distances below are cosine
        # distances (0.12 is a strong hit, 0.92 is noise).
        metadata = {"hnsw:space": "cosine"}

        def query(self, **_kwargs):
            return {
                "ids": [["weak", "strong"]],
                "documents": [["unrelated filler", "The FIR names the accused on page 2."]],
                "metadatas": [[
                    {"documentName": "Noise.pdf", "pageNumber": 9},
                    {"documentName": "FIR.pdf", "pageNumber": 2},
                ]],
                "distances": [[0.92, 0.12]],
            }

    original_embed = chat_service.embedding_service.embed_query
    original_collection = chat_service.vectorstore_service._get_collection
    chat_service.embedding_service.embed_query = lambda _q: [0.1] * 8
    chat_service.vectorstore_service._get_collection = lambda: FakeCollection()
    try:
        hits = chat_service._retrieve_relevant_chunks("case-1", "Who is named in the FIR?", 4)
    finally:
        chat_service.embedding_service.embed_query = original_embed
        chat_service.vectorstore_service._get_collection = original_collection

    assert len(hits) == 1
    assert hits[0]["document_name"] == "FIR.pdf"
    assert hits[0]["page_number"] == 2
    assert hits[0]["score"] >= chat_service.MIN_RETRIEVAL_SCORE


def test_chat_skips_llm_when_unretrievable(monkeypatch):
    monkeypatch.setattr(chat_service.settings, "llm_provider", "gemini")
    monkeypatch.setattr(chat_service, "_retrieve_relevant_chunks", lambda *_args: [])

    def fail_if_called(_prompt):
        raise AssertionError("LLM must not run without retrieved evidence")

    monkeypatch.setattr(chat_service, "_call_gemini_sdk", fail_if_called)
    result = chat_service.chat_case("case-empty", "What is the chargesheet date?")

    assert result["citations"] == []
    assert "No documents have been uploaded" in result["answer"]


def test_citations_only_come_from_retrieved_passages():
    passages = [
        {
            "document_name": "Chargesheet.pdf",
            "page_number": 4,
            "snippet": "The chargesheet was filed on 12 January 2024.",
            "score": 88.0,
        }
    ]
    answer = (
        "The filing date is 12 January 2024 "
        "[Source 1: Chargesheet.pdf, Page 4]."
    )
    citations = chat_service._extract_citations_from_answer(answer, passages)

    assert len(citations) == 1
    assert citations[0]["document_name"] == "Chargesheet.pdf"
    assert citations[0]["page_number"] == 4
    assert "chargesheet" in citations[0]["snippet"].lower()
