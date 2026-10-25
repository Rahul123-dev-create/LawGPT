"""
Module 8 — Interactive Case Assistant Chatbot (Context-Aware Document
Conversational RAG with Citation Grounding).

Builds a grounded legal assistant that answers user queries about a specific
case by retrieving relevant document chunks from ChromaDB, formatting them
with provenance metadata, and passing the context to the Gemini LLM with
conversation history.
"""

import json
from typing import Optional

from ..core.config import settings
from ..core.logging import logger
from . import embedding_service, vectorstore_service
from .llm_service import AnalysisError, _call_gemini_sdk

CHROMA_COLLECTION = settings.chroma_collection
# Cosine-similarity floor (0-100). Weaker hits are dropped so the LLM is not
# "grounded" on near-random neighbors.
MIN_RETRIEVAL_SCORE = 35.0


def _distance_to_similarity(distance: float, space: str) -> float:
    """Convert a Chroma distance to a 0-1 similarity for the collection's
    actual space.

    The document collection is created without explicit metadata, so Chroma
    uses squared L2 over normalized embeddings (d = 2 - 2·cos). Treating that
    as cosine distance (1 - d) under-scores every real hit and silently drops
    perfectly good evidence, so the space is read from the collection itself.
    """
    space = (space or "l2").lower()
    try:
        dist = float(distance)
    except (TypeError, ValueError):
        return 0.0

    if space == "cosine":
        similarity = 1.0 - dist
    elif space == "ip":
        similarity = 1.0 - dist
    else:  # squared L2
        similarity = 1.0 - (dist / 2.0)
    return max(0.0, min(1.0, similarity))


def _citation_payload(passage: dict) -> dict:
    return {
        "document_name": passage["document_name"],
        "page_number": passage["page_number"],
        "snippet": passage["snippet"][:300],
        "score": passage["score"],
    }


def _retrieve_relevant_chunks(case_id: str, query: str, top_k: int) -> list[dict]:
    """Retrieve the most relevant document chunks for a query within a case.

    Uses the same ChromaDB document collection and embedding pipeline used by
    Module 4's document processing. Results are filtered by caseId metadata
    and sorted by cosine distance (closest first).
    """
    if not query.strip():
        return []

    query_embedding = embedding_service.embed_query(query)
    collection = vectorstore_service._get_collection()
    space = ((getattr(collection, "metadata", None) or {}).get("hnsw:space") or "l2")

    try:
        raw = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where={"caseId": case_id},
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        logger.warning("ChromaDB query failed for chat (case %s): %s", case_id, exc)
        return []

    ids = raw.get("ids", [[]])[0]
    documents = raw.get("documents", [[]])[0]
    metadatas = raw.get("metadatas", [[]])[0]
    distances = raw.get("distances", [[]])[0]

    hits = []
    for i in range(len(ids)):
        meta = metadatas[i] if i < len(metadatas) else {}
        dist = distances[i] if i < len(distances) else 1.0
        # Convert the collection's distance metric to a similarity (0-100).
        similarity = _distance_to_similarity(dist, space) * 100
        if similarity < MIN_RETRIEVAL_SCORE:
            continue
        hits.append({
            "document_name": meta.get("documentName", "Unknown"),
            "page_number": int(meta.get("pageNumber", 0)),
            "snippet": documents[i] if i < len(documents) else "",
            "score": round(similarity, 1),
        })

    return hits


def _case_context_block(case_context: Optional[dict]) -> list[str]:
    """Render the case record (metadata + generated analysis) for the prompt.
    This is what lets the assistant answer before any document is uploaded."""
    if not case_context:
        return []

    lines: list[str] = []
    title = (case_context.get("title") or "").strip()
    if title:
        header = title
        number = (case_context.get("caseNumber") or "").strip()
        if number:
            header += f" ({number})"
        lines.append(f"Case: {header}")
    for label, key in (("Case type", "caseType"), ("Court", "court"), ("Status", "status")):
        value = str(case_context.get(key) or "").strip()
        if value:
            lines.append(f"{label}: {value}")

    description = (case_context.get("description") or "").strip()
    if description:
        lines.append(f"Case description: {description}")

    summary = (case_context.get("summary") or "").strip()
    if summary:
        lines.append(f"AI case summary: {summary}")

    key_points = [str(k).strip() for k in (case_context.get("keyPoints") or []) if str(k).strip()]
    if key_points:
        lines.append("Key issues identified: " + "; ".join(key_points[:8]))

    law_parts = []
    for law in (case_context.get("laws") or [])[:10]:
        section = str(law.get("section") or "").strip()
        if not section:
            continue
        code = str(law.get("code") or "").strip()
        part = f"{code} Section {section}".strip()
        label = str(law.get("label") or "").strip()
        equivalent = str(law.get("equivalent") or "").strip()
        if label:
            part += f" ({label})"
        if equivalent:
            part += f" [equivalent: {equivalent}]"
        law_parts.append(part)
    if law_parts:
        lines.append("Applicable legal sections: " + "; ".join(law_parts))

    return lines


def _build_grounded_prompt(
    history: list[dict],
    context_passages: list[dict],
    query: str,
    case_context: Optional[dict] = None,
) -> str:
    """Construct a grounded legal assistant prompt combining conversation
    history, the case record, retrieved source context, and the active query."""
    lines: list[str] = []

    lines.append(
        "You are LawGPT, an expert legal research assistant specializing in "
        "Indian law. You assist lawyers and legal professionals by analyzing "
        "case documents and providing accurate, grounded answers."
    )
    lines.append("")
    lines.append("CRITICAL RULES:")
    lines.append("- Ground factual claims about this case in the CASE CONTEXT and the retrieved document context below.")
    lines.append("- ALWAYS cite specific documents and page numbers when referencing facts from them.")
    lines.append("- Be precise, objective, and professional in your responses.")
    lines.append("- Do not invent or assume facts not present in the context.")
    lines.append("- When discussing legal provisions, cite the exact section and statute.")
    if context_passages:
        lines.append("- If the context does not contain enough information, say so clearly.")
    else:
        lines.append(
            "- No document excerpts were retrieved, so answer from the CASE CONTEXT and "
            "your general knowledge of Indian law, and say plainly that no case documents "
            "are indexed yet (suggest uploading documents for evidence-grounded answers)."
        )
        lines.append("- Clearly separate case-specific facts (from CASE CONTEXT) from general legal principles.")
    lines.append("")

    case_block = _case_context_block(case_context)
    if case_block:
        lines.append("CASE CONTEXT:")
        lines.extend(case_block)
        lines.append("")

    if context_passages:
        lines.append("RETRIEVED DOCUMENT CONTEXT:")
        lines.append("The following passages are from the case documents, retrieved "
                      "by semantic similarity. Each passage includes a document name "
                      "and page number for citation.")
        lines.append("")
        for i, passage in enumerate(context_passages, 1):
            lines.append(
                f"[Source {i}: {passage['document_name']}, "
                f"Page {passage['page_number']}, "
                f"Relevance: {passage['score']:.0f}%]"
            )
            lines.append(passage["snippet"])
            lines.append("")

    if history:
        lines.append("CONVERSATION HISTORY:")
        for msg in history[-10:]:  # Last 10 messages for context window
            role = msg.get("role", "user")
            content = msg.get("content", "")
            lines.append(f"{'User' if role == 'user' else 'Assistant'}: {content}")
        lines.append("")

    lines.append(f"USER QUERY: {query}")
    lines.append("")
    lines.append(
        "Provide a clear, well-structured answer. When citing document sources, use the "
        "format: [Source N: Document Name, Page X]; cite statutes as the exact code and "
        "section (e.g. IPC Section 420 / BNS Section 318(4))."
    )

    return "\n".join(lines)


def _extract_citations_from_answer(answer: str, context_passages: list[dict]) -> list[dict]:
    """Map answer citations back onto retrieved passages only.

    Citations never invent documents. If the model does not name a source,
    the retrieved passages that actually grounded the prompt are returned so
    the UI can show evidence rather than unsourced prose.
    """
    citations = []
    seen = set()
    answer_l = (answer or "").lower()

    for i, passage in enumerate(context_passages, 1):
        doc_name = passage["document_name"]
        page_num = passage["page_number"]
        markers = (
            f"[source {i}:",
            f"source {i}:",
            f"page {page_num}",
            doc_name.lower(),
        )
        if any(marker in answer_l for marker in markers if marker):
            key = (doc_name, page_num)
            if key not in seen:
                seen.add(key)
                citations.append(_citation_payload(passage))

    if not citations:
        for passage in context_passages[:3]:
            key = (passage["document_name"], passage["page_number"])
            if key not in seen:
                seen.add(key)
                citations.append(_citation_payload(passage))

    return citations


def _deterministic_response(
    query: str,
    context_passages: list[dict],
    history: list[dict],
    case_context: Optional[dict] = None,
) -> dict:
    """Deterministic fallback when LLM is unavailable. Returns a structured
    response from the retrieved context and/or the case record — never a crash
    and never a fabricated answer."""
    if context_passages:
        answer_parts = [
            "Based on the case documents, here are the relevant passages I found:\n"
        ]
        for i, passage in enumerate(context_passages[:3], 1):
            answer_parts.append(
                f"{i}. **{passage['document_name']}** (Page {passage['page_number']}):\n"
                f"   {passage['snippet'][:500]}\n"
            )

        answer_parts.append(
            "\n*Note: This response was generated from document retrieval without LLM analysis. "
            "For a more detailed answer, please configure a valid GEMINI_API_KEY.*"
        )

        return {
            "answer": "\n".join(answer_parts),
            "citations": [_citation_payload(p) for p in context_passages[:3]],
        }

    # No document chunks for this question — fall back to the case record so
    # the chat stays useful on a brand-new case (and never errors out).
    case_lines = _case_context_block(case_context)
    if not case_lines:
        return {
            "answer": (
                "No documents have been uploaded and indexed for this case yet, so I have "
                "no evidence-grounded material to work from. Upload the FIR, complaint, "
                "chargesheet or other case papers in the Documents tab, wait for processing "
                "to finish, and ask again — I will then answer with page-level citations."
            ),
            "citations": [],
        }

    answer = (
        "No document passages matched this question, so here is what the case record "
        "itself holds:\n\n" + "\n".join(f"- {line}" for line in case_lines)
        + "\n\n*This answer is drawn from the stored case metadata and AI analysis, not "
        "from retrieved document pages. Upload and process case documents for "
        "page-cited evidence grounding.*"
    )
    return {"answer": answer, "citations": []}


def chat_case(
    case_id: str,
    query: str,
    history: Optional[list[dict]] = None,
    top_k: int = 6,
    case_context: Optional[dict] = None,
) -> dict:
    """Main entry point for case chat. Retrieves relevant document chunks,
    constructs a grounded prompt with the case record and conversation
    history, and calls the LLM.

    Returns:
        {
            "answer": str,
            "citations": [
                {
                    "document_name": str,
                    "page_number": int,
                    "snippet": str,
                    "score": float
                }
            ]
        }
    """
    if history is None:
        history = []
    if case_context is None:
        case_context = {}

    # 1. Retrieve relevant document chunks (case-scoped, score-filtered).
    #    Retrieval failure or an empty index must never raise: the case record
    #    below keeps the conversation alive.
    try:
        context_passages = _retrieve_relevant_chunks(case_id, query, top_k)
    except Exception as exc:
        logger.warning("Chat retrieval failed for case %s: %s", case_id, exc)
        context_passages = []

    logger.info(
        "Chat retrieval for case %s: %d grounded chunks for query '%s'",
        case_id, len(context_passages), query[:80],
    )

    # 2. Grounding gate: without any evidence to stand on (no retrieved
    #    chunks AND no case record), never ask the LLM to invent an answer.
    #    Case metadata alone is enough grounding to keep the conversation going.
    if not context_passages and not _case_context_block(case_context):
        return _deterministic_response(query, context_passages, history, case_context)

    # 3. Build the grounded prompt (case record + retrieved context + history)
    prompt = _build_grounded_prompt(history, context_passages, query, case_context)

    # 4. Respect the configured provider; stub mode must not make network calls.
    if settings.llm_provider != "gemini":
        return _deterministic_response(query, context_passages, history, case_context)

    # Try the configured LLM, then fall back to deterministic retrieval output.
    try:
        raw_response = _call_gemini_sdk(prompt)
        # The LLM may return plain text or JSON; handle both
        try:
            parsed = json.loads(raw_response)
            answer = parsed.get("answer", raw_response)
        except (json.JSONDecodeError, TypeError):
            answer = raw_response

        citations = _extract_citations_from_answer(answer, context_passages)

        logger.info("Chat response generated for case %s (%d citations)", case_id, len(citations))
        return {
            "answer": answer,
            "citations": citations,
        }

    except AnalysisError as exc:
        logger.warning("LLM unavailable for chat (case %s): %s — using deterministic fallback", case_id, exc)
        return _deterministic_response(query, context_passages, history, case_context)
