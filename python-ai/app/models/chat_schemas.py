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


class ChatRequest(BaseModel):
    case_id: str
    query: str
    history: List[ChatMessage] = Field(default_factory=list)
    top_k: int = Field(default=6, ge=1, le=20)


class ChatResponseData(BaseModel):
    answer: str = ""
    citations: List[Citation] = Field(default_factory=list)


class ChatResponse(BaseModel):
    success: bool = True
    data: ChatResponseData = Field(default_factory=ChatResponseData)
