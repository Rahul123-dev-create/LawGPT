"""Chat endpoint tests using FastAPI TestClient (stub LLM, no Gemini)."""

from fastapi.testclient import TestClient

from app.main import app
from app.services import embedding_service

client = TestClient(app)


def test_embedding_service_falls_back_without_sentence_transformers():
    original_model = embedding_service._model
    embedding_service._model = None

    try:
        vec = embedding_service.embed_query("What is the validity of a contract?")
        assert isinstance(vec, list)
        assert len(vec) > 0
        assert all(isinstance(v, float) for v in vec)
    finally:
        embedding_service._model = original_model


def test_chat_case_uses_stub_without_calling_gemini(monkeypatch):
    from app.services import chat_service

    monkeypatch.setattr(chat_service.settings, "llm_provider", "stub")
    monkeypatch.setattr(chat_service, "_retrieve_relevant_chunks", lambda *_args: [])

    def fail_if_called(_prompt):
        raise AssertionError("Gemini must not be called in stub mode")

    monkeypatch.setattr(chat_service, "_call_gemini_sdk", fail_if_called)
    result = chat_service.chat_case("test-case", "What documents are in this case?")

    # Stub mode never reaches Gemini, and an empty index is reported clearly
    # instead of crashing.
    assert "No documents have been uploaded" in result["answer"]
    assert result["citations"] == []


def test_chat_case_answers_from_case_context_when_no_documents(monkeypatch):
    """A brand-new case with no indexed documents still gets a useful answer
    built from the case record (metadata + analysis), with no LLM call."""
    from app.services import chat_service

    monkeypatch.setattr(chat_service.settings, "llm_provider", "stub")
    monkeypatch.setattr(chat_service, "_retrieve_relevant_chunks", lambda *_args: [])

    def fail_if_called(_prompt):
        raise AssertionError("Gemini must not be called in stub mode")

    monkeypatch.setattr(chat_service, "_call_gemini_sdk", fail_if_called)

    result = chat_service.chat_case(
        "case-with-context",
        "What is this case about?",
        case_context={
            "title": "State v. Ramesh Kumar",
            "caseNumber": "Crl. Misc. 1123/2026",
            "summary": "Complaint alleging cheating and dishonest inducement.",
            "laws": [
                {"code": "IPC", "section": "420", "label": "Cheating", "equivalent": "BNS 318(4)"}
            ],
            "documentCount": 0,
        },
    )

    assert "State v. Ramesh Kumar" in result["answer"]
    assert "IPC Section 420" in result["answer"]
    assert "BNS 318(4)" in result["answer"]


def test_chat_case_calls_llm_with_case_context_when_no_chunks(monkeypatch):
    """With a live provider, an empty retrieval no longer blocks the answer:
    the case record grounds the prompt so the assistant can fall back to
    general Indian legal knowledge."""
    from app.services import chat_service

    monkeypatch.setattr(chat_service.settings, "llm_provider", "gemini")
    monkeypatch.setattr(chat_service, "_retrieve_relevant_chunks", lambda *_args: [])

    prompts = []

    def fake_gemini(prompt):
        prompts.append(prompt)
        return "No documents are indexed yet; under Indian law a chargesheet is filed under BNSS."

    monkeypatch.setattr(chat_service, "_call_gemini_sdk", fake_gemini)

    result = chat_service.chat_case(
        "case-gemini",
        "When must the chargesheet be filed?",
        case_context={"title": "State v. Ramesh Kumar", "documentCount": 0},
    )

    assert len(prompts) == 1
    assert "CASE CONTEXT" in prompts[0]
    assert "State v. Ramesh Kumar" in prompts[0]
    assert "chargesheet" in result["answer"]


def test_chat_case_returns_200_with_valid_payload():
    payload = {
        "case_id": "test-case-001",
        "query": "What documents are in this case?",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "answer" in data["data"]
    assert "citations" in data["data"]
    assert isinstance(data["data"]["answer"], str)
    assert isinstance(data["data"]["citations"], list)


def test_chat_case_with_history():
    payload = {
        "case_id": "test-case-001",
        "query": "Tell me more about that.",
        "history": [
            {"role": "user", "content": "What documents are in this case?"},
            {"role": "assistant", "content": "Based on the documents..."},
        ],
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "answer" in data["data"]


def test_chat_case_with_top_k():
    payload = {
        "case_id": "test-case-001",
        "query": "Summarize the key arguments",
        "top_k": 3,
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_chat_case_empty_query():
    payload = {"case_id": "test-case-001", "query": ""}
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_chat_case_missing_case_id():
    response = client.post("/chat/case", json={"query": "What is this case about?"})
    assert response.status_code == 422


def test_chat_case_missing_query():
    response = client.post("/chat/case", json={"case_id": "test-case-001"})
    assert response.status_code == 422


def test_chat_case_citation_keys():
    payload = {
        "case_id": "test-case-001",
        "query": "What are the primary grounds?",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    for citation in response.json()["data"]["citations"]:
        assert "document_name" in citation
        assert "page_number" in citation
        assert "snippet" in citation
        assert "score" in citation


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
