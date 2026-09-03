"""Module 7 — structured legal argument generation & evidence strength scoring.

Primary path is `llm_service.generate_json()` (Gemini). When the service was
started with `LLM_PROVIDER=stub` or Gemini is unreachable/unconfigured, a
deterministic, rule-based fallback produces the same *shape* so the backend and
acceptance tests never depend on a live API key. Both paths are normalized into
the `ArgumentsResult` Pydantic schema by `generate_arguments`.
"""

from ..core.config import settings
from ..core.logging import logger
from ..models.arguments_schemas import AnalysisDocumentInput
from .llm_service import AnalysisError, generate_json

# Curated section → landmark citation map used by the deterministic fallback so
# citations are real, well-known authorities (aligned with the Module 6 corpus).
_PRECEDENT_BY_SECTION = {
    "154": "Lalita Kumari v. Govt. of U.P., (2014) 2 SCC 1",
    "156": "Lalita Kumari v. Govt. of U.P., (2014) 2 SCC 1",
    "41": "Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273",
    "41a": "Arnesh Kumar v. State of Bihar, (2014) 8 SCC 273",
    "439": "Satender Kumar Antil v. CBI, (2022) 10 SCC 51",
    "438": "Sushila Aggarwal v. State (NCT of Delhi), (2020) 5 SCC 1",
    "482": "State of Haryana v. Bhajan Lal, 1992 Supp (1) SCC 335",
    "21": "Maneka Gandhi v. Union of India, (1978) 1 SCC 248",
    "14": "E.P. Royappa v. State of Tamil Nadu, (1974) 4 SCC 3",
    "19(1)(a)": "Shreya Singhal v. Union of India, (2015) 5 SCC 1",
    "66a": "Shreya Singhal v. Union of India, (2015) 5 SCC 1",
    "377": "Navtej Singh Johar v. Union of India, (2018) 10 SCC 1",
    "142": "Supreme Court Bar Association v. Union of India, (1998) 4 SCC 409",
    "27a": "Rajya Vokkaligara Sangha v. State of Karnataka, Karnataka HC (2019)",
    "226": "T.P. Senkumar, IPS v. Union of India, (2017) 6 SCC 801",
    "368": "Kesavananda Bharati v. State of Kerala, (1973) 4 SCC 225",
}

# Imperfect evidence-quality signals (case-insensitive substring match) used by
# the deterministic scorer. Order matters: the first match wins for the base
# score; the marker lists then nudge the score up/down.
_BASE_SCORE_BY_KIND = [
    ("judgment", 92),
    ("chargesheet", 88),
    ("charge sheet", 88),
    ("fir", 85),
    ("first information", 85),
    ("certificate", 84),
    ("gazette", 92),
    ("notification", 84),
    ("byelaw", 86),
    ("bye-laws", 86),
    ("bylaws", 86),
    ("registration", 86),
    ("registered", 86),
    ("court order", 82),
    ("affidavit", 76),
    ("agreement", 78),
    ("contract", 78),
    ("deed", 80),
    ("report", 74),
    ("complaint", 70),
    ("petition", 68),
    ("invoice", 65),
    ("statement", 64),
    ("memo", 60),
    ("letter", 58),
    ("order", 78),
]

_OFFICIAL_MARKERS = [
    "government",
    "registered",
    "seal",
    "stamped",
    "certified",
    "notarized",
    "public record",
    "statutory",
    "official",
    "issued by",
]

_WEAK_MARKERS = [
    "alleged",
    "claim",
    "hearsay",
    "stated by",
    "according to the statement",
    "unverified",
    "contended",
    "submitted by",
]


def _clean_strings(items) -> list:
    return [str(x).strip() for x in (items or []) if str(x).strip()]


def _dedupe(items: list) -> list:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _document_blob(doc: AnalysisDocumentInput) -> str:
    parts = []
    for page in doc.pages:
        text = getattr(page, "text", "") or ""
        if text:
            parts.append(f"(page {getattr(page, 'pageNumber', '?')}): {text}")
    return " ".join(parts)


def _admissibility_for_score(score: int) -> str:
    if score >= 70:
        return "High"
    if score >= 45:
        return "Medium"
    return "Low"


def _score_document(doc: AnalysisDocumentInput):
    """Rule-based evidence strength scorer. Returns (score, reasoning)."""
    doc_type = (doc.docType or "").lower()
    doc_name = (doc.documentName or "").lower()
    haystack = f"{doc_type} {doc_name}"

    base = 55
    matched_kind = ""
    for kind, value in _BASE_SCORE_BY_KIND:
        if kind in haystack:
            base = value
            matched_kind = kind
            break

    text = _document_blob(doc).lower()
    official_hits = sum(1 for marker in _OFFICIAL_MARKERS if marker in text)
    weak_hits = sum(1 for marker in _WEAK_MARKERS if marker in text)

    score = base + min(official_hits * 3, 12) - min(weak_hits * 4, 12)
    # Substantive multi-page evidence carries more corroborating weight.
    score += min(max(len(doc.pages) - 1, 0) * 2, 6)
    score = max(10, min(99, score))

    label = matched_kind or (doc.docType or doc.documentName or "document")
    reasons = [f"{label.title()} — treated as the submission's evidentiary basis."]
    if official_hits:
        reasons.append("Official/governmental endorsement detected (registered/certified/sealed or primary public record).")
    if weak_hits:
        reasons.append("Contains claim-style or hearsay language, reducing evidentiary weight.")
    if not _document_blob(doc).strip():
        reasons.append("No extracted text available — scored on document type alone.")

    reasoning = " ".join(reasons)
    return score, reasoning


def _citations_for_laws(laws: list) -> list:
    citations = []
    for law in laws or []:
        section = str(law.get("section") or "").strip()
        key = section.lower()
        if key in _PRECEDENT_BY_SECTION:
            citations.append(_PRECEDENT_BY_SECTION[key])
            continue
        # Also try the bare section number (handles "IPC Section 420" style).
        bare = "".join(ch for ch in section if ch.isalnum()).lower()
        if bare in _PRECEDENT_BY_SECTION:
            citations.append(_PRECEDENT_BY_SECTION[bare])
    return _dedupe(citations)


def _deterministic_evidence(doc: AnalysisDocumentInput, is_primary: bool = False) -> dict:
    score, reasoning = _score_document(doc)
    return {
        "documentId": doc.documentId,
        "documentName": doc.documentName,
        "docType": doc.docType,
        "score": int(score),
        "admissibility": _admissibility_for_score(int(score)),
        "primaryEvidence": is_primary,
        "reasoning": reasoning,
    }


def _deterministic_arguments(
    case_summary: str, key_points: list, laws: list, documents: list
) -> dict:
    """Deterministic, rule-based fallback that mirrors the LLM JSON shape.

    Used when LLM_PROVIDER is not 'gemini' or Gemini is unreachable — never
    present it as model output (generationMode='deterministic')."""
    section_labels = _dedupe(
        f"{l.get('code', '')} Section {l['section']}" if l.get("section") else ""
        for l in (laws or [])
        if l.get("section")
    )
    supporting_laws = _dedupe(
        str(
            l.get("label")
            or f"{l.get('code', '')} Section {l.get('section', '')}".strip()
        )
        for l in (laws or [])
        if l.get("label") or l.get("section")
    )
    citations = _citations_for_laws(laws)
    key_bullets = _clean_strings(key_points)[:5]

    petitioner = []
    if section_labels:
        petitioner.append(
            {
                "title": f"Violation of {section_labels[0]}",
                "legalGround": (
                    f"The impugned action is not saved by {section_labels[0]}: the "
                    "requirements of that provision have not been satisfied, so the "
                    "action is legally unsustainable on the present record."
                ),
                "proceduralViolations": [
                    "Disregard of the mandatory procedure prescribed by the statute",
                    "Action taken without the objective satisfaction contemplated by law",
                ],
                "statutorySections": section_labels[:5],
                "supportingLaws": supporting_laws[:5],
                "citations": citations[:4],
                "strength": "High",
            }
        )

    petitioner.append(
        {
            "title": "Procedure established by law was not followed",
            "legalGround": (
                "Procedural safeguards governing the present proceedings were bypassed — "
                "including prior notice, an opportunity of hearing, and a reasoned "
                "decision — rendering the action arbitrary and void."
            ),
            "proceduralViolations": [
                "No notice or opportunity of hearing was afforded before the adverse action",
                "Decision not supported by recorded reasons",
                "Designated statutory procedure was circumvented",
            ],
            "statutorySections": section_labels[:3],
            "supportingLaws": supporting_laws[:3],
            "citations": citations[:3],
            "strength": "Medium",
        }
    )

    petitioner.append(
        {
            "title": "No prima facie case / abuse of process",
            "legalGround": (
                "The material on record does not disclose the ingredients of the acts "
                "alleged; permitting the present proceedings to continue would amount to "
                "an abuse of the process of the court."
            ),
            "proceduralViolations": [
                "Proceedings initiated without prima facie material",
                "Vague and vexatious allegations without corroboration",
            ],
            "statutorySections": section_labels[:3],
            "supportingLaws": supporting_laws[:3],
            "citations": citations[:3],
            "strength": "Medium",
        }
    )

    respondent = [
        {
            "title": "Denial and traverse of the allegations",
            "defenseStrategy": (
                "The core factual assertions are put in issue; the burden rests on the "
                "opposing party to prove each element on the balance of probabilities "
                "or beyond reasonable doubt, as applicable."
            ),
            "counterArguments": ["The averments are contested and unproven"] + key_bullets[:2],
            "statutoryDefenses": section_labels[:5],
            "proceduralCounterpoints": [
                "The present proceedings are premature",
                "The principles of natural justice were duly complied with",
            ],
            "mitigatingFactors": [
                "Good-faith participation throughout the proceedings",
                "No prior adverse findings against the party",
            ],
        },
        {
            "title": "Statutory compliance and due-process defense",
            "defenseStrategy": (
                "The actions complained of were taken strictly in accordance with the "
                "relevant statute and procedural regime applicable at the time."
            ),
            "counterArguments": [
                "The petitioner has not demonstrated concrete prejudice",
                "An alternative statutory remedy was available and remains open",
            ],
            "statutoryDefenses": section_labels[:5],
            "proceduralCounterpoints": [
                "The petition is not maintainable in its present form / is barred by delay",
            ],
            "mitigatingFactors": [
                "Substantial compliance with the governing provisions",
                "Any irregularity is curable and non-prejudicial",
            ],
        },
    ]

    if not section_labels and not citations and petitioner:
        petitioner[0]["title"] = "Substantive merits of the dispute"
        petitioner[0]["legalGround"] = (
            "The claim is supported by the material placed on record; the opposing "
            "party's position fails on the substantive merits of the dispute."
        )

    evidence_scores = []
    max_score = -1
    primary_idx = -1
    for i, doc in enumerate(documents):
        score, _ = _score_document(doc)
        if score > max_score:
            max_score = score
            primary_idx = i
    for i, doc in enumerate(documents):
        evidence_scores.append(_deterministic_evidence(doc, is_primary=(i == primary_idx)))

    return {
        "arguments": {"petitioner": petitioner, "respondent": respondent},
        "evidenceScores": evidence_scores,
    }
def _build_prompt(
    case_summary: str, key_points: list, laws: list, documents: list, truncated: bool
) -> str:
    lines = [
        "You are a senior Indian counsel drafting a structured legal brief for a case.",
        "Produce a single JSON object (no markdown, no commentary) with exactly the following keys:",
        "",
        '  "arguments": {',
        '    "petitioner": [ {',
        '      "title": "<short ground title>",',
        '      "legalGround": "<the legal ground, legally reasoned>",',
        '      "proceduralViolations": ["<procedural violations by the opposing party>"],',
        '      "statutorySections": ["<statutes/sections relied upon>"],',
        '      "supportingLaws": ["<labels of supporting laws>"],',
        '      "citations": ["<real, well-known precedent citations>"],',
        '      "strength": "High" | "Medium" | "Low"',
        "    } ],",
        '    "respondent": [ {',
        '      "title": "<short rebuttal title>",',
        '      "defenseStrategy": "<overall defense strategy>",',
        '      "counterArguments": ["<counter-arguments to the petitioner>"],',
        '      "statutoryDefenses": ["<statutory defenses relied upon>"],',
        '      "proceduralCounterpoints": ["<procedural counter-points>"],',
        '      "mitigatingFactors": ["<mitigating factors>"]',
        "    } ]",
        "  },",
        '  "evidenceScores": [ {',
        '    "documentId": "<same id supplied below>",',
        '    "documentName": "<document name>",',
        '    "docType": "<document type>",',
        '    "score": <integer 0-100>,',
        '    "admissibility": "High" | "Medium" | "Low",',
        '    "primaryEvidence": <true if this is the single most important/authoritative document in the case, false otherwise>,',
        '    "reasoning": "<qualitative reasoning, e.g. official government endorsement," " registered statutory bye-laws, primary public record, or circumstantial claim>"',
        "  } ]",
    ]

    lines.append("")
    lines.append("Rules:")
    lines.append("- Grounds must be bifurcated: petitioner/prosecution and respondent/defense.")
    lines.append(
        "- For each law section, prefer the landmark precedent that the section is classically associated with "
        "(for example Section 482 CrPC -> State of Haryana v. Bhajan Lal; Section 154 CrPC -> Lalita Kumari; "
        "Section 41/41A CrPC -> Arnesh Kumar; Sections 439/438 CrPC -> Satender Kumar Antil; Article 21 -> Maneka Gandhi). "
        "Only cite cases you are confident are real."
    )
    lines.append("- Score every provided document; never invent a documentId that was not provided.")
    lines.append(
        "- Score reflects evidentiary credibility: official/government or registered/public records score higher; "
        "circumstantial, hearsay, or claim-style submissions score lower."
    )
    lines.append(
        "- Strengths: High when the ground follows squarely from the statute/precedent, otherwise Medium or Low."
    )
    lines.append("Do not mention this schema in your output; output ONLY the JSON object.")

    if truncated:
        lines.append("NOTE: the document text was truncated for length; later pages may be missing.")

    lines.append("")
    if case_summary.strip():
        lines.append(f"CASE SUMMARY: {case_summary.strip()}")
    if key_points:
        lines.append("KEY POINTS: " + "; ".join(_clean_strings(key_points)[:10]))
    if laws:
        lines.append("RELEVANT LAWS: " + "; ".join(
            f"{l.get('code','')} {l.get('section','')}" for l in laws if l.get("section")
        ))
    lines.append("")
    lines.append("DOCUMENTS:")
    for i, doc in enumerate(documents, start=1):
        lines.append(f"[Document #{i}: {doc.documentName} ({doc.docType or 'unknown'}) id={doc.documentId}]")
        text = _document_blob(doc)
        lines.append(text if text else "(no extractable text)")

    return "\n".join(lines)
def _normalize_ground(raw: dict) -> dict:
    return {
        "title": str(raw.get("title") or "Ground").strip(),
        "legalGround": str(raw.get("legalGround") or "").strip(),
        "proceduralViolations": _clean_strings(raw.get("proceduralViolations")),
        "statutorySections": _clean_strings(raw.get("statutorySections")),
        "supportingLaws": _clean_strings(raw.get("supportingLaws")),
        "citations": _clean_strings(raw.get("citations")),
        "strength": _clean_strength(raw.get("strength")),
    }


def _normalize_rebuttal(raw: dict) -> dict:
    return {
        "title": str(raw.get("title") or "Rebuttal").strip(),
        "defenseStrategy": str(raw.get("defenseStrategy") or "").strip(),
        "counterArguments": _clean_strings(raw.get("counterArguments")),
        "statutoryDefenses": _clean_strings(raw.get("statutoryDefenses")),
        "proceduralCounterpoints": _clean_strings(raw.get("proceduralCounterpoints")),
        "mitigatingFactors": _clean_strings(raw.get("mitigatingFactors")),
    }


def _clean_strength(value) -> str:
    value = str(value or "").strip().lower()
    if value in ("high", "low"):
        return value.title()
    return "Medium"


def _normalize_evidence(raw: dict, doc: AnalysisDocumentInput, fallback: dict) -> dict:
    raw_score = raw.get("score")
    try:
        score = int(round(float(raw_score)))
    except (TypeError, ValueError):
        score = int(fallback["score"])

    score = max(0, min(100, score))
    admissibility = str(raw.get("admissibility") or "").strip().title()
    if admissibility not in ("High", "Medium", "Low"):
        admissibility = _admissibility_for_score(score)

    reasoning = str(raw.get("reasoning") or "").strip() or fallback["reasoning"]
    primary_raw = raw.get("primaryEvidence")
    if isinstance(primary_raw, bool):
        primary_evidence = primary_raw
    else:
        primary_evidence = fallback.get("primaryEvidence", False)

    return {
        "documentId": doc.documentId,
        "documentName": str(raw.get("documentName") or doc.documentName or ""),
        "docType": str(raw.get("docType") or doc.docType or ""),
        "score": score,
        "admissibility": admissibility,
        "primaryEvidence": bool(primary_evidence),
        "reasoning": reasoning,
    }


def _normalize_result(raw: dict, documents: list) -> dict:
    args = raw.get("arguments") or {}
    petitioner = [_normalize_ground(g) for g in (args.get("petitioner") or [])]
    respondent = [_normalize_rebuttal(r) for r in (args.get("respondent") or [])]
    if not petitioner and not respondent:
        # LLM returned an unusable shell — rebuild deterministically.
        rebuilt = _deterministic_arguments("", [], [], documents)
        args = rebuilt.get("arguments") or {}
        petitioner = [_normalize_ground(g) for g in (args.get("petitioner") or [])]
        respondent = [_normalize_rebuttal(r) for r in (args.get("respondent") or [])]

    raw_scores = {str(e.get("documentId")): e for e in (raw.get("evidenceScores") or [])}
    fallback_by_id = {d.documentId: _deterministic_evidence(d) for d in documents}

    evidence_scores = []
    for doc in documents:
        evidence_scores.append(
            _normalize_evidence(raw_scores.get(doc.documentId, {}), doc, fallback_by_id[doc.documentId])
        )

    avg = round(sum(e["score"] for e in evidence_scores) / len(evidence_scores), 1) if evidence_scores else 0.0
    summary_metrics = {
        "totalGrounds": len(petitioner),
        "totalRebuttals": len(respondent),
        "evidenceCount": len(evidence_scores),
        "evidenceHealthScore": avg,
    }

    return {
        "arguments": {"petitioner": petitioner, "respondent": respondent},
        "evidenceScores": evidence_scores,
        "summaryMetrics": summary_metrics,
        "generationMode": str(raw.get("generationMode") or "llm"),
    }


def generate_arguments(
    case_id: str,
    case_summary: str,
    key_points: list,
    laws: list,
    documents: list,
) -> dict:
    """Primary entry point: structured arguments + per-document evidence scores.

    Uses `llm_service.generate_json()` when the configured provider is 'gemini';
    falls back to the deterministic builder when the provider is 'stub' or when
    the LLM is unreachable so the pipeline never hard-fails on a missing key."""
    if settings.llm_provider == "gemini":
        try:
            prompt = _build_prompt(case_summary, key_points, laws, documents, truncated=False)
            raw = generate_json(prompt, language="en")
            raw["generationMode"] = "llm"
            logger.info("Structured arguments generated via Gemini (case %s)", case_id)
        except AnalysisError as exc:
            logger.warning("Gemini unavailable (%s) — using deterministic argument fallback", exc)
            raw = _deterministic_arguments(case_summary, key_points, laws, documents)
            raw["generationMode"] = "deterministic"
    else:
        raw = _deterministic_arguments(case_summary, key_points, laws, documents)
        raw["generationMode"] = "deterministic"

    return _normalize_result(raw, documents)