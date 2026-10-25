from typing import List, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class Citation(BaseModel):
    document_name: str = ""
    page_number: int = 0
    snippet: str = ""
    score: float = 0.0


class CaseContext(BaseModel):
    """Case metadata + generated analysis, streamed in by the backend so the
    assistant can answer from the case record even before (or without)
    document retrieval hits."""

    title: str = ""
    caseNumber: str = ""
    caseType: str = ""
    court: str = ""
    status: str = ""
    description: str = ""
    summary: str = ""
    keyPoints: List[str] = Field(default_factory=list)
    laws: List[dict] = Field(default_factory=list)
    documentCount: int = 0


class ChatRequest(BaseModel):
    case_id: str
    query: str
    history: List[ChatMessage] = Field(default_factory=list)
    top_k: int = Field(default=6, ge=1, le=20)
    case_context: Optional[CaseContext] = None


class ChatResponseData(BaseModel):
    answer: str = ""
    citations: List[Citation] = Field(default_factory=list)


class ChatResponse(BaseModel):
    success: bool = True
    data: ChatResponseData = Field(default_factory=ChatResponseData)
