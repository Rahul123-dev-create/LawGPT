from fastapi import APIRouter, HTTPException

from ...models.chat_schemas import ChatRequest, ChatResponse, ChatResponseData
from ...services.chat_service import chat_case
from ...services.llm_service import AnalysisError

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/case", response_model=ChatResponse, summary="Interactive case assistant chat with citation grounding")
def chat_case_route(req: ChatRequest):
    """Module 8 — context-aware document conversational RAG.

    Retrieves relevant document chunks from ChromaDB, constructs a grounded
    legal prompt with conversation history, and calls the LLM. Returns a
    structured answer with document citations and page references.
    """
    try:
        result = chat_case(
            case_id=req.case_id,
            query=req.query,
            history=[msg.model_dump() for msg in req.history],
            top_k=req.top_k,
        )
        return ChatResponse(
            success=True,
            data=ChatResponseData(**result),
        )
    except AnalysisError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
