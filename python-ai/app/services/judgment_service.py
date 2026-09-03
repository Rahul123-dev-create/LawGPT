import json
from pathlib import Path
from typing import Optional, List, Dict, Any

import chromadb

from ..core.config import settings
from ..core.logging import logger
from .embedding_service import embed_texts, embed_query

COLLECTION_NAME = "precedents_collection"
SEED_FILE_PATH = Path(__file__).parent.parent / "data" / "seed_judgments.json"


class JudgmentService:
    def __init__(self):
        self._client = None
        self._collection = None
        self._judgments_map: Dict[str, Dict[str, Any]] = {}

    def _get_collection(self):
        if self._collection is None:
            self._client = chromadb.PersistentClient(
                path=settings.chroma_persist_dir,
                settings=chromadb.Settings(anonymized_telemetry=False),
            )
            # Use cosine space for precedent similarity matching
            self._collection = self._client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"}
            )
        return self._collection

    @staticmethod
    def _compose_document(judgment: Dict[str, Any]) -> str:
        sections_str = ", ".join(judgment.get("sections", []))
        keywords_str = ", ".join(judgment.get("similarity_keywords", []))
        return (
            f"Title: {judgment['title']}. Citation: {judgment['citation']}. "
            f"Court: {judgment['court']} ({judgment['year']}). Bench: {judgment['bench']}. "
            f"Sections: {sections_str}. Keywords: {keywords_str}. "
            f"Facts: {judgment['facts_summary']} Ratio Decidendi: {judgment['ratio_decidendi']} "
            f"Holding: {judgment['holding']}"
        )

    def initialize_and_index(self) -> None:
        """Synchronize the seeded landmark-judgment corpus into its dedicated
        Chroma collection.

        The corpus is tiny (15 items), so we keep the logic deterministic and
        idempotent: delete stale ids no longer present in the seed file and
        upsert every current record with fresh embeddings.
        """
        if not SEED_FILE_PATH.exists():
            raise FileNotFoundError(f"Seed judgments file not found at {SEED_FILE_PATH}")

        with open(SEED_FILE_PATH, "r", encoding="utf-8") as f:
            judgments = json.load(f)

        self._judgments_map = {j["id"]: j for j in judgments}
        collection = self._get_collection()

        seed_ids = [j["id"] for j in judgments]
        existing_ids = set(collection.get(include=[]).get("ids", []))
        stale_ids = sorted(existing_ids.difference(seed_ids))
        if stale_ids:
            collection.delete(ids=stale_ids)
            logger.info("Removed %s stale precedent record(s) from %s", len(stale_ids), COLLECTION_NAME)

        documents = [self._compose_document(j) for j in judgments]
        embeddings = embed_texts(documents)
        metadatas = [
            {
                "judgment_id": j["id"],
                "title": j["title"],
                "citation": j["citation"],
                "court": j["court"],
                "year": int(j["year"]),
                "sections": ", ".join(j.get("sections", [])),
            }
            for j in judgments
        ]

        collection.upsert(
            ids=seed_ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        logger.info("Synchronized %s seeded precedent(s) into %s", len(judgments), COLLECTION_NAME)

    def search_precedents(
        self, query: str, top_k: int = 5, section_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Searches precedents using cosine similarity embeddings, with optional section filtering."""
        query = query.strip()
        if not query:
            return []

        if not self._judgments_map:
            self.initialize_and_index()

        collection = self._get_collection()
        if collection.count() == 0:
            return []

        query_embedding = embed_query(query)

        # Retrieve candidates
        fetch_k = min(len(self._judgments_map), max(top_k * 4, 10))
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=fetch_k,
            include=["metadatas", "distances"],
        )

        matched_items = []
        if results and results.get("ids") and len(results["ids"]) > 0:
            ids = results["ids"][0]
            distances = results["distances"][0]

            for j_id, dist in zip(ids, distances):
                judgment = self._judgments_map.get(j_id)
                if not judgment:
                    continue

                # Section filter check if provided
                if section_filter and section_filter.strip():
                    filter_lower = section_filter.strip().lower()
                    sec_match = any(
                        filter_lower in s.lower() for s in judgment.get("sections", [])
                    )
                    if not sec_match:
                        continue

                # Cosine distance to similarity: dist is 1 - similarity for cosine space
                cosine_sim = max(0.0, min(1.0, 1.0 - dist))

                matched_item = {
                    **judgment,
                    "score": round(cosine_sim, 4),
                    "match_percentage": round(cosine_sim * 100, 1),
                }
                matched_items.append(matched_item)

                if len(matched_items) >= top_k:
                    break

        return matched_items


judgment_service = JudgmentService()
