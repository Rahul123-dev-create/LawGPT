"""
Module 8 — Chat service tests.

Tests the POST /chat/case endpoint using FastAPI's TestClient with the
deterministic fallback (no Gemini API key required).
"""

import os

os.environ["LLM_PROVIDER"] = "stub"  # force deterministic fallback

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_case_returns_200_with_valid_payload():
    """POST /chat/case should return 200 with success and expected keys."""
    payload = {
        "case_id": "test-case-001",
        "query": "What documents are in this case?",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    assert "answer" in data["data"]
    assert "citations" in data["data"]
    assert isinstance(data["data"]["answer"], str)
    assert isinstance(data["data"]["citations"], list)


def test_chat_case_with_history():
    """POST /chat/case should accept conversation history."""
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
    assert "citations" in data["data"]


def test_chat_case_with_top_k():
    """POST /chat/case should accept custom top_k parameter."""
    payload = {
        "case_id": "test-case-001",
        "query": "Summarize the key arguments",
        "top_k": 3,
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_chat_case_empty_query():
    """POST /chat/case with empty query should still return 200."""
    payload = {
        "case_id": "test-case-001",
        "query": "",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_chat_case_missing_case_id():
    """POST /chat/case without case_id should return 422 validation error."""
    payload = {
        "query": "What is this case about?",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 422


def test_chat_case_missing_query():
    """POST /chat/case without query should return 422 validation error."""
    payload = {
        "case_id": "test-case-001",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 422


def test_chat_case_citation_keys():
    """Each citation should have the required keys: document_name, page_number, snippet, score."""
    payload = {
        "case_id": "test-case-001",
        "query": "What are the primary grounds?",
    }
    response = client.post("/chat/case", json=payload)
    assert response.status_code == 200
    data = response.json()
    citations = data["data"]["citations"]
    for citation in citations:
        assert "document_name" in citation
        assert "page_number" in citation
        assert "snippet" in citation
        assert "score" in citation
