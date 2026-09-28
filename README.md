# LawGPT — AI-Driven Legal Evidence Analyzer

Final year BE (Information Science Engineering) project. A full-stack legal-tech
platform that ingests case documents (FIR, complaints, witness statements,
chargesheets, court orders) and uses OCR + NLP + RAG + an LLM to summarize
cases, tag applicable IPC/BNS sections, retrieve similar judgments, draft
prosecution/defence arguments, score evidence strength, answer questions
about the uploaded documents, and export a formatted PDF report.

## Architecture at a glance

Three independently runnable services:

| Service     | Stack                                | Port | Responsibility |
|-------------|----------------------------------------|------|-----------------|
| `frontend`  | React + Vite + Tailwind + shadcn/ui    | 5173 | UI — auth screens, dashboard, upload, analysis views, chat, reports |
| `backend`   | Node.js + Express + MongoDB            | 5000 | Auth, users, case/document/report records, API gateway to the AI service |
| `python-ai` | FastAPI + LangChain + ChromaDB + Gemini| 8000 | OCR, extraction, embeddings, RAG, LLM calls, PDF report generation |

```
Browser
   │  REST + JWT (Bearer token)
   ▼
frontend  (React)
   │  REST
   ▼
backend   (Express)  ──────────────►  MongoDB
   │  internal REST (service key, not user-facing)     users / documents / cases / reports / chats
   ▼
python-ai (FastAPI)  ──────────────►  ChromaDB (vectorstore/)  +  Gemini API
```

**Why split backend and python-ai instead of one Python monolith or one Node
monolith?** Node/Express is a natural fit for auth, CRUD, and request
validation; Python has the mature ecosystem for OCR, embeddings, LangChain
and RAG. Keeping them as separate services also means the Gemini API key and
the vector store only ever live inside `python-ai` — the public-facing
`backend` never touches them directly, which is a cleaner security boundary
for a project you'll be asked to defend in a viva.

## Running each service (once code lands in later modules)

```bash
# 1. Frontend
cd frontend && npm install && npm run dev          # http://localhost:5173

# 2. Backend
cd backend && npm install && npm run dev            # http://localhost:5000

# 3. AI service
cd python-ai
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000            # http://localhost:8000
```

Copy each `.env.example` to `.env` in the same folder and fill in real values
(Mongo URI, JWT secret, Gemini API key) before running.

## Module status

- [x] Module 1 — Architecture & scaffolding
- [x] Module 2 — Authentication (backend complete; frontend complete, retrofitted for the new IA)
- [x] Architecture update — sidebar/topbar shell, i18n, IA restructuring
- [x] Module 3 — Case Management + Smart Case Folder + Hearing Management *(see below)*
- [x] **Module 4 — Document upload pipeline (OCR → extraction → chunking → embeddings → vector store) — Phase 1 + Phase 2 complete** *(see docs/MODULE4_DOCUMENTS.md)*
- [x] **Module 5 — Case analysis (summary, timeline, entities, IPC/BNS tagging) — Phase 3 (analysis layer) complete** *(see docs/MODULE5_ANALYSIS.md)*; the BNS / BNSS / BSA sidebar pages remain
- [ ] Module 6 — Similar judgments (RAG) — also backs Judge Research, Constitution, Supreme/High Court, Judgment Search, Case Comparison, Legal Dictionary
- [ ] Module 7 — Arguments + evidence scoring — also backs Evidence Analyzer
- [ ] Module 8 — Legal chatbot — also backs AI Assistant (and replaces the sample data in the case-workspace preview)
- [ ] Module 9 — PDF reports — also backs the Reports sidebar page
- [ ] Module 10 — Polish/logging/integration pass — also backs Clients, cross-case Hearings calendar, Tasks, Calendar, Analytics, Settings, Bookmarks

Everything from the old "Module 4" onward shifted down one slot when Module
3 was redefined from "document pipeline" to "Case Management" — the
`plannedModule` badges in `frontend/src/config/toolsRegistry.js` reflect the
new numbering.

## Case Management (Module 3)

**Core model**: `Case` is the central entity — not a document. A case has
embedded `parties` and `notes` subdocuments, and a separate `Hearing`
collection (many hearings per case). See `docs/MODULE3_CASES.md` for the
full API reference and `caseType`/party-role/hearing-type are deliberately
free text (curated suggestions in `frontend/src/config/caseOptions.js`, no
enum lock-in) so new categories don't need a migration.

**`status` vs `isArchived`**: the product spec listed "Archived" as both a
status value and a separate boolean flag. Those conflict — a status value
that also needs to be "restored to something" is ambiguous. Resolved as:
`status` is 4 real outcomes (`ongoing`/`won`/`lost`/`closed`); `isArchived`
is an orthogonal boolean that can apply to any of them. "Archived Cases" in
the sidebar = `isArchived: true` regardless of status; restore is just
`isArchived: false`. Full reasoning is in `backend/src/models/Case.js`.

**Perspective-aware architecture**: deliberately *not* implemented yet, as
instructed. Evidence and case facts stay neutral (no per-party duplication)
so a later module can layer a selectable perspective (defence/prosecution/
petitioner/etc.) on top without restructuring the data.

**Smart Case Folder**: `overview` / `timeline` / `hearings` / `parties` /
`notes` / `activity` are real, as are `documents` (Module 4 upload pipeline),
`ai-analysis` (Module 5: summary, document timeline, entities, applicable
laws) and `laws` (Module 5: applicable-laws view with curated IPC↔BNS
equivalents). `evidence` / `witnesses` / `judgments` / `strategy` / `reports`
still render through the generic `CaseComingSoonTab`, each tagged with the
module that will build it — no fabricated data behind any of them.

**Timeline vs Activity**: both are driven by the same real events (case
creation + hearings) via `GET /cases/:id/timeline` — Timeline renders them
graphically, Activity as a flat reverse-chronological feed. Neither is a
full field-level audit log (who changed what value) — that's a distinct,
larger feature, tracked as a follow-up rather than faked.

Full folder-by-folder breakdown is in `docs/ARCHITECTURE.md`. **For current
state, what's real vs scaffolded, and key decisions, see
[`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md) — it's the living doc now,
updated with every module.**

