from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...services.judgment_service import judgment_service
from ...core.logging import logger

router = APIRouter(prefix="/research", tags=["research"])


class PrecedentSearchRequest(BaseModel):
    query: str = Field(..., description="Legal query or case facts to search precedents for")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of top precedents to return")
    section_filter: Optional[str] = Field(default=None, description="Optional statutory section filter")


class PrecedentItem(BaseModel):
    id: str
    title: str
    citation: str
    court: str
    year: int
    bench: str
    sections: List[str]
    facts_summary: str
    ratio_decidendi: str
    holding: str
    similarity_keywords: List[str]
    score: float
    match_percentage: float


class PrecedentSearchResponse(BaseModel):
    success: bool = True
    count: int
    results: List[PrecedentItem]


@router.post("/judgments/search", response_model=PrecedentSearchResponse, summary="Semantic search over landmark precedents")
def search_judgments(payload: PrecedentSearchRequest):
    """Search landmark precedents using vector semantic search and optional section filters."""
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    try:
        results = judgment_service.search_precedents(
            query=query,
            top_k=payload.top_k,
            section_filter=payload.section_filter,
        )
        return PrecedentSearchResponse(
            success=True,
            count=len(results),
            results=results,
        )
    except Exception as e:
        logger.error(f"Error during precedent search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
