# LawGPT

Evidence-grounded legal research platform for Indian case work. Lawyers upload FIR copies, complaints, witness statements, chargesheets, and orders; the system extracts text, indexes it, and answers only from that evidence.

**Stack:** React · Node.js/Express · FastAPI · ChromaDB · Gemini · MongoDB

## Architecture

Three independently runnable services. The public API never holds the LLM key or the vector index.

| Service | Stack | Port | Owns |
|---|---|---|---|
| `frontend` | React, Vite, Tailwind | 5173 | Auth UI, case workspace, chat, reports |
| `backend` | Node.js, Express, MongoDB | 5000 | Auth, cases, documents, reports; gateway to AI |
| `python-ai` | FastAPI, ChromaDB, Gemini | 8000 | OCR, chunking, embeddings, RAG, LLM, PDF |

```
Browser
  │  REST + JWT
  ▼
frontend (React)
  │  REST
  ▼
backend (Express) ──► MongoDB  (users, cases, documents, chats, reports)
  │  internal REST
  ▼
python-ai (FastAPI) ──► ChromaDB  +  Gemini
```

Node handles auth, CRUD, and upload orchestration. Python handles OCR, embeddings, and grounded generation. Gemini credentials and the vector store live only inside `python-ai`.

## End-to-end flow

1. **Document upload** — authenticated user attaches files to a case. Backend stores the blob and queues processing.
2. **Text extraction** — FastAPI detects PDF/DOCX/TXT/image, extracts a text layer, and OCRs scanned pages with Tesseract.
3. **Vector search** — cleaned page text is chunked, embedded (`BAAI/bge-small-en-v1.5`, with a deterministic fallback), and upserted into ChromaDB scoped by `caseId`.
4. **LLM grounding** — analysis, arguments, and chat retrieve case-scoped chunks above a similarity floor. Empty retrieval skips the LLM instead of hallucinating.
5. **Evidenced answer** — responses include document name, page number, snippet, and score so every claim can be traced back to an uploaded page.

## What ships

- JWT auth (access token + httpOnly refresh cookie), rate limiting, Helmet, mongo sanitization
- Case folders: parties, notes, hearings, timeline, activity
- Document pipeline with retry of crashed jobs and idempotent re-index
- Case analysis: summary, timeline, entities, IPC/BNS tagging
- Similar-judgment research over a seeded precedent index
- Prosecution/defence argument drafts and evidence strength scores
- Case chat with citation grounding
- PDF case-brief export

## Local setup

Prerequisites: Node.js 20+, Python 3.11+, MongoDB, Tesseract (optional, for scanned PDFs).

```bash
git clone https://github.com/Rahul123-dev-create/LawGPT.git
cd LawGPT
```

Copy each `.env.example` to `.env` and set `MONGO_URI`, JWT secrets, and `GEMINI_API_KEY` (optional — default `LLM_PROVIDER=stub` runs without a live key).

```bash
# Frontend
cd frontend && npm install && npm run dev          # http://localhost:5173

# Backend
cd backend && npm install && npm run dev           # http://localhost:5000

# AI service
cd python-ai
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000           # http://localhost:8000
```

Health checks: `GET http://localhost:5000/health` and `GET http://localhost:8000/health`.

## Tests

```bash
cd python-ai
python -m pytest
```

CI runs the same suite on every push via `.github/workflows/test.yml`. Tests use the stub LLM and skip embedding-model downloads.

## Project layout

```
frontend/     React app
backend/      Express API + Mongo models + document worker
python-ai/    FastAPI RAG/LLM service
docs/         Module notes and architecture
```
