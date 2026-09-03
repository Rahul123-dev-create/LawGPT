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
        # Convert cosine distance to similarity score (0-100 range)
        similarity = max(0.0, min(1.0, 1.0 - dist)) * 100
        hits.append({
            "document_name": meta.get("documentName", "Unknown"),
            "page_number": int(meta.get("pageNumber", 0)),
            "snippet": documents[i] if i < len(documents) else "",
            "score": round(similarity, 1),
        })

    return hits


def _build_grounded_prompt(
    history: list[dict],
    context_passages: list[dict],
    query: str,
) -> str:
    """Construct a grounded legal assistant prompt combining conversation
    history, retrieved source context, and the active user query."""
    lines: list[str] = []

    lines.append(
        "You are LawGPT, an expert legal research assistant specializing in "
        "Indian law. You assist lawyers and legal professionals by analyzing "
        "case documents and providing accurate, grounded answers."
    )
    lines.append("")
    lines.append("CRITICAL RULES:")
    lines.append("- ONLY answer based on the provided document context below.")
    lines.append("- If the context does not contain enough information, say so clearly.")
    lines.append("- ALWAYS cite specific documents and page numbers when referencing facts.")
    lines.append("- Be precise, objective, and professional in your responses.")
    lines.append("- Do not invent or assume facts not present in the context.")
    lines.append("- When discussing legal provisions, cite the exact section and statute.")
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
        "Provide a clear, well-structured answer. When citing sources, use the "
        "format: [Source N: Document Name, Page X]. "
        "If no relevant sources found, state that the information is not "
        "available in the case documents."
    )

    return "\n".join(lines)


def _extract_citations_from_answer(answer: str, context_passages: list[dict]) -> list[dict]:
    """Extract citations that the LLM referenced in its answer, matching
    them back to the original context passages."""
    citations = []
    seen = set()

    for passage in context_passages:
        doc_name = passage["document_name"]
        page_num = passage["page_number"]

        # Check if this source was referenced in the answer
        for marker in [
            f"[Source {context_passages.index(passage) + 1}:",
            f"Source {context_passages.index(passage) + 1}:",
            f"Page {page_num}",
            f"page {page_num}",
        ]:
            if marker.lower() in answer.lower():
                key = (doc_name, page_num)
                if key not in seen:
                    seen.add(key)
                    citations.append({
                        "document_name": doc_name,
                        "page_number": page_num,
                        "snippet": passage["snippet"][:300],
                        "score": passage["score"],
                    })
                break

    # If no explicit citations found but we have context, include top passages
    if not citations and context_passages:
        for passage in context_passages[:3]:
            key = (passage["document_name"], passage["page_number"])
            if key not in seen:
                seen.add(key)
                citations.append({
                    "document_name": passage["document_name"],
                    "page_number": passage["page_number"],
                    "snippet": passage["snippet"][:300],
                    "score": passage["score"],
                })

    return citations


def _deterministic_response(
    query: str, context_passages: list[dict], history: list[dict]
) -> dict:
    """Deterministic fallback when LLM is unavailable. Returns a structured
    response with the retrieved context as the answer."""
    if not context_passages:
        return {
            "answer": (
                "I couldn't find relevant document passages to answer your question. "
                "Please ensure documents have been uploaded and processed for this case."
            ),
            "citations": [],
        }

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

    citations = [
        {
            "document_name": p["document_name"],
            "page_number": p["page_number"],
            "snippet": p["snippet"][:300],
            "score": p["score"],
        }
        for p in context_passages[:3]
    ]

    return {
        "answer": "\n".join(answer_parts),
        "citations": citations,
    }


def chat_case(
    case_id: str,
    query: str,
    history: Optional[list[dict]] = None,
    top_k: int = 6,
) -> dict:
    """Main entry point for case chat. Retrieves relevant document chunks,
    constructs a grounded prompt with conversation history, and calls the LLM.

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

    # 1. Retrieve relevant document chunks
    context_passages = _retrieve_relevant_chunks(case_id, query, top_k)
    logger.info(
        "Chat retrieval for case %s: %d chunks found for query '%s'",
        case_id, len(context_passages), query[:80],
    )

    # 2. Build the grounded prompt
    prompt = _build_grounded_prompt(history, context_passages, query)

    # 3. Try LLM, fall back to deterministic
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
        return _deterministic_response(query, context_passages, history)
