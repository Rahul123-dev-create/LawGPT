import json
import os
from typing import Any

from ..core.config import settings
from ..core.logging import logger


class AnalysisError(Exception):
    """Raised when the LLM cannot be reached or its output is not usable JSON."""


def _extract_json(text: str) -> dict:
    """Extract and strictly parse the first JSON object from model output."""
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise AnalysisError("LLM returned no JSON object")

    candidate = text[start : end + 1]

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise AnalysisError(f"LLM returned invalid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise AnalysisError("LLM JSON was not an object")

    return parsed


# Preferred high-performance generation models in priority order
PREFERRED_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]


def _import_gemini_sdk():
    """Try importing the Gemini SDK with fallback between old and new package names."""
    try:
        import google.generativeai as genai
        logger.info("Using google.generativeai SDK package")
        return genai
    except ImportError:
        try:
            import google.genai as genai
            logger.info("Using google.genai SDK package (fallback)")
            return genai
        except ImportError as exc:
            raise AnalysisError(
                "Neither google.generativeai nor google.genai package is installed. "
                "Run: pip install google-generativeai"
            ) from exc


def _call_gemini_sdk(prompt: str) -> str:
    """Iterate through available Gemini models in priority order."""
    api_key = getattr(settings, "gemini_api_key", None)
    if not api_key:
        raise AnalysisError("GEMINI_API_KEY is not configured in .env")

    genai = _import_gemini_sdk()
    try:
        genai.configure(api_key=api_key)
    except Exception:
        pass

    # 1. Fetch live models active for this key
    available_from_api = []
    try:
        for m in genai.list_models():
            supported = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" in supported:
                name = m.name.replace("models/", "")
                if not any(term in name.lower() for term in ["vision", "embed", "imagen", "robotics"]):
                    available_from_api.append(name)
    except Exception as e:
        logger.warning(f"Could not list remote models: {e}")

    # 2. Build prioritized candidate list
    candidate_models = []
    configured_model = getattr(settings, "gemini_model", None)
    if configured_model and configured_model.strip():
        candidate_models.append(configured_model.strip().replace("models/", ""))

    for pref in PREFERRED_MODELS:
        if pref not in candidate_models and (pref in available_from_api or not available_from_api):
            candidate_models.append(pref)

    for rem in available_from_api:
        if rem not in candidate_models:
            candidate_models.append(rem)

    logger.info(f"Candidate Gemini models for case analysis loop: {candidate_models}")

    errors = []
    deprecated_keywords = ["deprecated", "not found", "404", "no model", "unsupported", "invalid"]

    # 3. Model Fallback Loop
    for model_name in candidate_models:
        try:
            logger.info(f"==> Attempting legal analysis with model: {model_name}")
            # Build kwargs defensively — SDK versions differ in accepted parameters
            model_kwargs = {"model_name": model_name}
            gen_config = {"temperature": 0.2}
            # Try both JSON-output patterns (old vs new SDK)
            try:
                gen_config["response_mime_type"] = "application/json"
                model_kwargs["generation_config"] = gen_config
            except Exception:
                model_kwargs["generation_config"] = gen_config

            try:
                model = genai.GenerativeModel(**model_kwargs)
            except TypeError:
                # google.genai may use different signature
                try:
                    model = genai.GenerativeModel(model=model_name, config=gen_config)
                except Exception as inner:
                    raise inner

            try:
                response = model.generate_content(prompt)
            except TypeError:
                response = model.generate_content(contents=prompt)

            # Extract text robustly across SDK versions
            text = ""
            if hasattr(response, "text") and response.text:
                text = response.text
            elif hasattr(response, "candidates") and response.candidates:
                try:
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, "text"):
                            text += part.text
                except Exception:
                    pass

            if text and text.strip():
                logger.info(f"==> SUCCESS: Real legal analysis generated using model: {model_name}")
                return text
            else:
                raise Exception("Empty response text from model")
        except Exception as e:
            err_str = str(e)
            lower_err = err_str.lower()
            is_deprecated = any(kw in lower_err for kw in deprecated_keywords)
            prefix = "DEPRECATED" if is_deprecated else "FAILED"
            logger.warning(f"[{prefix}] Model {model_name}: {err_str}")
            errors.append(f"{model_name}: {err_str}")
            continue

    raise AnalysisError("All candidate Gemini models in loop failed: " + " | ".join(errors))


def generate_json(
    prompt: str,
    language: str = "en",
    documents_hint: list[dict] | None = None,
) -> dict:
    """Run analysis prompt and return parsed JSON."""
    raw_json_text = _call_gemini_sdk(prompt)
    return _extract_json(raw_json_text)