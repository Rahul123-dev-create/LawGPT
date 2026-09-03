import os

os.environ["LLM_PROVIDER"] = "stub"  # force deterministic fallback, no Gemini key needed

from fastapi.testclient import TestClient

from app.main import app

payload = {
    "caseId": "case-123",
    "caseSummary": "Society's elected committee was superseded by an administrator without notice under Section 27A of the Karnataka Societies Registration Act.",
    "keyPoints": [
        "No show-cause notice before appointment of administrator",
        "Elected committee displaced without recorded reasons",
        "Action taken on extraneous considerations",
    ],
    "laws": [
        {"code": "KSRA", "section": "27A", "label": "Societies Registration Act s.27A"},
        {"code": "CONST", "section": "Article 226", "label": "Article 226"},
    ],
    "documents": [
        {
            "documentId": "doc-001",
            "documentName": "FIR - registered public record",
            "docType": "FIR",
            "pages": [
                {"pageNumber": 1, "text": "Government police station official FIR record, sworn and sealed.", "charCount": 56}
            ],
        },
        {
            "documentId": "doc-002",
            "documentName": "Statement of witness",
            "docType": "statement",
            "pages": [
                {"pageNumber": 1, "text": "The witness alleged that the incident allegedly occurred and claimed he heard about it from hearsay.", "charCount": 96}
            ],
        },
        {
            "documentId": "doc-003",
            "documentName": "Society bye-laws",
            "docType": "registered bye-laws",
            "pages": [
                {"pageNumber": 1, "text": "Registered statutory bye-laws of the society certified by the Registrar.", "charCount": 72}
            ],
        },
    ],
}

with TestClient(app) as client:
    r = client.post("/arguments/generate", json=payload)
    print("status:", r.status_code)
    data = r.json()
    print("generationMode:", data["generationMode"])
    print("petitioner grounds:", len(data["arguments"]["petitioner"]))
    print("respondent rebuttals:", len(data["arguments"]["respondent"]))
    print("evidence scores:", len(data["evidenceScores"]))
    for e in data["evidenceScores"]:
        print("  -", e["documentName"], "| score:", e["score"], "| admissibility:", e["admissibility"], "| primary:", e["primaryEvidence"])
    print("metrics:", data["summaryMetrics"])
    assert r.status_code == 200
    assert data["arguments"]["petitioner"], "petitioner grounds missing"
    assert data["arguments"]["respondent"], "respondent rebuttals missing"
    assert len(data["evidenceScores"]) == 3, "every document must be scored"
    for e in data["evidenceScores"]:
        assert 0 <= e["score"] <= 100
        assert e["admissibility"] in ("High", "Medium", "Low")
        assert isinstance(e["primaryEvidence"], bool)
    p0 = data["arguments"]["petitioner"][0]
    print("ground[0].citations:", p0["citations"])
    assert all("Bhajan Lal" not in c for c in p0["citations"]), "no Bhajan Lal citation expected for KSRA s.27A"
    print("E2E OK")

# Direct service-level call too
os.environ["LLM_PROVIDER"] = "stub"
from app.services.argument_service import generate_arguments

result = generate_arguments(
    case_id="case-123",
    case_summary=payload["caseSummary"],
    key_points=payload["keyPoints"],
    laws=payload["laws"],
    documents=[],
)
print("service-level OK:", result["summaryMetrics"])