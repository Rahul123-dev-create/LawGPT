from fastapi import APIRouter, HTTPException

from ...models.arguments_schemas import ArgumentsRequest, ArgumentsResult
from ...services.argument_service import generate_arguments
from ...services.llm_service import AnalysisError

router = APIRouter(prefix="/arguments", tags=["arguments"])


@router.post("/generate", response_model=ArgumentsResult, summary="Generate structured legal arguments and evidence strength scores")
def generate_arguments_route(req: ArgumentsRequest):
    """Module 7 — structured legal argument generation.

    Stateless per request: the backend streams the case's authoritative
    analysis (summary, key points, laws) and document page units (from MongoDB
    DocumentPage) here; this service never touches MongoDB or the uploads
    filesystem. The response bifurcates into petitioner/prosecution grounds and
    respondent/defense rebuttals, and scores each document's evidentiary
    strength (0-100, admissibility, reasoning)."""
    try:
        result = generate_arguments(
            case_id=req.caseId,
            case_summary=req.caseSummary,
            key_points=req.keyPoints,
            laws=req.laws,
            documents=req.documents,
        )
        return ArgumentsResult.model_validate(result)
    except AnalysisError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # pragmatic safety net for malformed model output
        raise HTTPException(status_code=500, detail=str(exc)) from exc