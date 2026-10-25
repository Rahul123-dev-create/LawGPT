# PROJECT_MEMORY.md — LawGPT

Single source of truth for architecture decisions, current state, and what's
real vs scaffolded. Read this before starting a new module so you don't have
to re-derive context from scratch.

## Product vision (updated by change request)

LawGPT is an **AI-powered Legal Case Management & Research Platform**, not
just a chatbot. Every case gets its own ChatGPT-like workspace (conversation
+ documents + evidence + judgments + timeline + notes + reports). A left
sidebar organizes three domains: **Case Workspace**, **Legal Research
Center**, **Practice Management**. The UI is multi-language (English +
Kannada now, extensible) via react-i18next.

## Architecture (unchanged since Module 1)

Three services — React/Vite frontend, Node/Express backend, Python/FastAPI
AI service — see `docs/ARCHITECTURE.md` for the full breakdown and data flow.

## Module status

- [x] Module 1 — Architecture & scaffolding
- [x] Module 2 — Authentication (backend complete; frontend complete, retrofitted for the new IA)
- [x] Architecture update — sidebar/topbar shell, i18n, IA restructuring
- [x] **Module 3 — Case Management + Smart Case Folder + Hearing Management**
- [x] **Module 4 — Document upload pipeline (OCR → extraction → chunking → embeddings → vector store) — **DONE: Phase 1 (backend foundation) + Phase 2 (full pipeline + frontend). Phase 1: Document model, nested routes, disk upload, list/detail/soft-delete/download, real documentCount, DOCUMENT_* CaseEvents. Phase 2: python-ai service (format detection → PDF/DOCX/TXT extraction → per-page OCR fallback → cleaning → page-aware chunking → embeddings → ChromaDB), DocumentPage page-provenance store, background worker + status lifecycle, reprocess/pages endpoints, frontend Documents tab + per-file-docType upload UI. See docs/MODULE4_DOCUMENTS.md.**
- [x] **Module 5 — Case analysis (summary, timeline, entities, IPC/BNS tagging) — DONE: Phase 3 (legal-document analysis layer). CaseAnalysis model (one per case, idempotent), synchronous POST/GET /cases/:caseId/analysis endpoints, python-ai analysis service (POST /analysis/case: Gemini behind LLM_PROVIDER + deterministic stub, Kannada detection by Unicode block with Chroma retrieval bypass, curated IPC↔BNS reference data, strict page/document provenance), AI_ANALYSIS_* CaseEvents, and real ai-analysis + laws case tabs. Module 4 pipeline untouched. See docs/MODULE5_ANALYSIS.md.** Remaining Module 5 work (BNS/BNSS/BSA sidebar pages) is a future phase.
- [ ] Module 6 — Similar judgments (RAG) — also backs Judge Research, Constitution, Supreme/High Court, Judgment Search, Case Comparison, Legal Dictionary
- [ ] Module 7 — Arguments + evidence scoring — also backs Evidence Analyzer
- [ ] Module 8 — Legal chatbot — also backs AI Assistant (and replaces the sample data in the case-workspace preview)
- [ ] Module 9 — PDF reports — also backs the Reports sidebar page
- [ ] Module 10 — Polish/logging/integration pass — also backs Clients, cross-case Hearings calendar, Tasks, Calendar, Analytics, Settings, Bookmarks

**Renumbering note**: Module 3 was originally "document upload pipeline."
The change request redefined Module 3 as Case Management, so everything
from the old Module 4 onward shifted down one slot. `toolsRegistry.js`
`plannedModule` values were updated to match — if you're adding a new
placeholder tool, check this table first.

## Frontend information architecture (new)

**Public** (`Layout` + `Navbar`, no sidebar): `/`, `/login`, `/register`, `/forgot-password`

**Authenticated** (`AppShell` = `Sidebar` + `TopBar`):
- `/app` → redirects to `/app/cases/ongoing`
- `/app/profile`
- `/app/search` (captures query, not wired to a real index yet)
- `/app/cases/new`, `/app/cases/preview` (design preview, sample data), `/app/cases/:status`
- `/app/case/:caseId/edit` — literal `edit` segment, registered as a sibling
  of `/app/case/:caseId` so React Router's static-over-dynamic ranking picks
  it over the `:section` catch-all below (verified working, not just assumed)
- `/app/case/:caseId` (`CaseDetailLayout`, real data via `GET /cases/:id`) → `overview` / `timeline` / `hearings` / `hearings/:hearingId` / `parties` / `notes` / `activity` (all real) / `:section` (generic `CaseComingSoonTab` for documents/evidence/witnesses/laws/judgments/ai-analysis/strategy/reports)
- `/app/research/:slug`, `/app/practice/:slug` — generic `ComingSoonView`, data-driven

Sidebar nav items live in `frontend/src/config/navigation.js` (case
statuses) and `frontend/src/config/toolsRegistry.js` (research + practice
tools). Adding a sidebar item is a one-line config change, not a new
component or route file.

### Case Workspace navigation update — August 2026

The Case Workspace sidebar was refined after Module 5. The top-level sidebar
now contains only:

```text
CASE WORKSPACE

Ongoing Cases
Closed Cases
Archived Cases
Recent Cases
Pinned Cases
```

`Won Cases`, `Lost Cases`, `Transferred Cases`, and `Other` are intentionally
not permanent sidebar children. They are category buttons on the **Closed
Cases** main page:

```text
Closed Cases

[ Won Cases ] [ Lost Cases ] [ Transferred Cases ] [ Other ]
```

Selecting a category navigates to a real status-filtered case list and visually
highlights the selected category. The routes are:

- `/app/cases/won` → Won Cases
- `/app/cases/lost` → Lost Cases
- `/app/cases/transferred` → Transferred Cases
- `/app/cases/closed` → Other

The `closed` backend status is therefore presented to users as the **Other**
closed-case category. This avoids creating an unnecessary second "other" status.

Clicking any case card continues to use the existing case workspace route:
`/app/case/:caseId/overview`. No separate case-detail implementation was added.

Current UI/status mapping:

- `ongoing` → Ongoing Cases
- `won` → Closed Cases → Won Cases
- `lost` → Closed Cases → Lost Cases
- `transferred` → Closed Cases → Transferred Cases
- `closed` → Closed Cases → Other
- `isArchived: true` → Archived Cases, independently of status
- `recent` → Recent Cases view
- `pinned` → Pinned Cases view

Implementation files changed for this update:

- `backend/src/models/Case.js`
- `frontend/src/components/layout/Sidebar.jsx`
- `frontend/src/config/caseOptions.js`
- `frontend/src/config/navigation.js`
- `frontend/src/i18n/locales/en/nav.json`
- `frontend/src/pages/app/CaseListView.jsx`

The frontend production build was run successfully after the update.

Git checkpoint for this update:

- `733ba22` — `Update case workspace navigation and statuses`

The earlier Module 5 checkpoint remains:

- `c9f06cd` — `Complete Module 5 AI case analysis`

The latest changes have been pushed to the project's GitHub `main` branch and
should be pulled before beginning Module 6.

## Case Management (Module 3) — final implementation

**Core model**: `Case` (`backend/src/models/Case.js`) is the central entity —
not a document. Embedded `parties[]` and `notes[]` subdocuments; a separate
`Hearing` collection (`backend/src/models/Hearing.js`) for the one-to-many
case→hearings relationship. `caseType`, party `role`, and `hearingType` are
free-text strings (curated suggestions via `<datalist>` in
`frontend/src/config/caseOptions.js`), not Mongoose enums — new categories
are a one-line config edit, no migration.

**Three independent boolean/status dimensions on `Case`** — don't conflate them:
- `status`: `ongoing` / `won` / `lost` / `transferred` / `closed` — the 5 case outcomes currently supported by the application.
- `isArchived`: orthogonal flag, user-driven via `PATCH /:id/archive` /
  `/:id/restore`. A case can be archived at any status.
- `isDeleted` (+ `deletedAt`): soft-delete flag, set via `DELETE /:id`,
  cleared via `PATCH /:id/undelete`. **Excluded from `listCases`
  unconditionally**, regardless of `isArchived` — a deleted case disappears
  from the Archived view too, not just its original status view. A case can
  be both `isArchived: true` and `isDeleted: true` at once (deleting an
  archived case doesn't clear the archive flag); every list query still
  hides it either way.

Why `status` is 4 values and not 5 ("archived" isn't one of them): the
product spec asked for "Archived" as a status value *and* a separate
`isArchived` boolean with explicit Archive/Restore actions — two archival
mechanisms fighting each other makes "restore" ambiguous (restore to what
prior status?). Resolved by keeping `status` to real outcomes only. See the
comment block at the top of `Case.js`.

**`Case.nextHearingDate` has exactly one writer.** `recalculateNextHearingDate(caseId)`
(`backend/src/services/hearingSchedulingService.js`) is the *only* code path
that sets this field — `PUT /api/cases/:id` explicitly excludes it from the
fields it will touch, even if sent in the request body (silently ignored,
same as any other non-allowed field). The function queries for the earliest
`Hearing` with `status: 'scheduled'`, `isDeleted: { $ne: true }`, and
`hearingDate >= now`; sets `Case.nextHearingDate` to that date, or `null` if
none exists. **It never invents, predicts, or carries forward a stale
value** — only a hearing date a user explicitly entered, on a hearing that's
still genuinely scheduled and in the future. Called after every hearing
create / update / transition / soft-delete.

**Hearing lifecycle — two deliberately separate write paths:**

1. `PUT /cases/:caseId/hearings/:hearingId` (`updateHearing`) — general
   correction of factual fields: `hearingDate`, `court`, `judge`,
   `hearingType`, `summary`, `notes`, `outcome`, `adjournmentReason`.
   **Cannot change `status` or `nextHearingDate`/`nextHearingNotes`** —
   those aren't in the validator or the controller's allowed-fields list, so
   they're rejected/ignored even if sent. `hearingDate` editing here is for
   genuine data-entry corrections (a typo), not for moving a hearing to a
   new date because it got adjourned — that's a different action (below).
2. `POST /cases/:caseId/hearings/:hearingId/transition` (`transitionHearing`)
   — the *only* path that can change a hearing's `status`, or set its
   `nextHearingDate`/`nextHearingNotes`. Backs the UI's Mark Completed /
   Adjourn / Postpone / Reschedule / Cancel / No Appearance actions.
   `status` must be one of the 6 non-`scheduled` values (`scheduled` is only
   ever a hearing's initial state). **This hearing's own `hearingDate` field
   is never touched here.** If the caller also supplies a `nextHearingDate`
   (only when `status` is `adjourned`/`postponed`/`rescheduled`), a
   **separate new `Hearing` document** is created — new `hearingNumber`
   (atomically claimed, same as at creation), `status: 'scheduled'`,
   `previousHearingId` pointing back to the hearing being transitioned. The
   original hearing's date is untouched; the new hearing is a new row. If no
   date is known yet, none is invented — the hearing just sits at
   `adjourned`/`postponed` with `nextHearingDate: null` on both the hearing
   and (once recalculated) the case.

   Example, matching the product spec exactly:
   ```
   Hearing #3 — 09 Aug 2026 — status: adjourned, reason: "Counsel unavailable"
                                          │ (previousHearingId)
                                          ▼
   Hearing #4 — 30 Aug 2026 — status: scheduled
   ```
   Hearing #3's date never becomes 30 Aug. If the court hadn't given a date
   yet, there would be no Hearing #4, and `Case.nextHearingDate` would be
   `null` until one is actually created.

7 hearing statuses (`backend/src/models/Hearing.js`): `scheduled`,
`completed`, `adjourned`, `postponed`, `cancelled`, `no_appearance`,
`rescheduled`.

**Hearing numbering is race-safe.** `claimNextHearingNumber(caseId)` in
`hearingController.js` atomically does
`Case.findByIdAndUpdate(caseId, { $inc: { hearingCounter: 1 } })` — MongoDB
serializes `$inc`, so two concurrent "add hearing" requests can never
compute the same number (unlike counting existing documents and adding 1,
which races). `Case.hearingCounter` is an internal field (`select: false`).
The unique `{ caseId: 1, hearingNumber: 1 }` index on `Hearing` is a safety
net on top of the atomic counter, not the primary defense — `createHearing`
and `transitionHearing`'s follow-up-hearing creation both go through
`createHearingSafely()`, which turns a stray E11000 into a clean 409 instead
of a raw Mongo error. Numbers are never reassigned on delete.

**Soft-delete exists for both `Case` and `Hearing`, with one intentional
asymmetry.** Both have `isDeleted`/`deletedAt`. Both are excluded from their
respective list endpoints (`listCases`, `listHearings`) unconditionally. Both
remain directly fetchable by ID (`getCase`/`getHearing` apply no `isDeleted`
filter) — this is what lets `previousHearingId` links and Timeline entries
keep working, and what lets `CaseDetailLayout` show a "this case was
deleted, restore it" banner if you land on one. Case has a real undelete
endpoint (`PATCH /cases/:id/undelete`) and that banner; **Hearing does not**
— there's no `PATCH /hearings/:id/undelete` and no restore UI, so a deleted
hearing is currently only viewable, not recoverable through the app itself
(the document still exists in MongoDB, so it's not unrecoverable, just not
exposed). `updateHearing`/`transitionHearing` both exclude `isDeleted`
hearings from their lookup (viewable via `getHearing`, not editable).
Neither soft-delete cascades: deleting a Case does not touch its Hearings;
deleting a Hearing does not touch the Case or other Hearings.
`recalculateNextHearingDate` excludes `isDeleted` hearings, so a deleted
still-"scheduled" hearing correctly stops counting toward
`Case.nextHearingDate`.

**`CaseEvent`** (`backend/src/models/CaseEvent.js`) is an append-only log —
27 event types spanning case/party/note/hearing/document lifecycle,
`{ createdAt: true, updatedAt: false }` (events are never edited, only
created). `GET /cases/:id/timeline` reads this collection directly
(`CaseEvent.find({ caseId }).sort('createdAt')`) rather than deriving events
from Case/Hearing timestamps on the fly. Timeline (`CaseTimelineTab`) and
Activity (`CaseActivityTab`) both consume this same endpoint — Timeline
renders it as a graphical vertical list, Activity as a flat
reverse-chronological feed. **Not a field-level audit log**: each event has
a human-readable `title`/`description` and a free-form `metadata` object
(e.g. `{ from, to }` on `CASE_STATUS_CHANGED`), not a structured
before/after diff for every field on every edit.

**Notes** are embedded subdocuments on `Case` with full CRUD, including
`PUT /cases/:id/notes/:noteId` (edit) — added after the initial build, which
only had add/delete.

**Access control**: non-admin users only ever see cases they created or are
in `assignedUsers` for (`middleware/caseAccess.js` + the `scopeToUser`
filter in `listCases`). Admins see everything. Hearings inherit their parent
case's access check — every hearing route runs `loadCase` +
`requireCaseAccess` via the nested router
(`router.use('/cases/:caseId/hearings', hearingRoutes)` in `routes/index.js`).

**Perspective-aware architecture**: deliberately *not* implemented. Case
facts, evidence, and hearings stay neutral — no per-party duplication —
specifically so a later module can layer a selectable perspective
(defence/prosecution/petitioner/etc.) over the same neutral data without
restructuring it.

**Smart Case Folder tabs**: `overview`, `timeline`, `hearings` (+ hearing
detail), `parties`, `notes`, `activity` are real, backed by the API.
`documents`, `evidence`, `witnesses`, `laws`, `judgments`, `ai-analysis`,
`strategy`, `reports` render through one generic `CaseComingSoonTab`
(`frontend/src/pages/app/case/CaseComingSoonTab.jsx`), each tagged with the
module that will build it (see `COMING_SOON_TABS` in `CaseDetailLayout.jsx`)
— nothing fabricated behind any of them.

**Frontend hearing forms**: `HearingForm.jsx` (create + factual-correction
edit) hides its `status` field entirely when editing an existing hearing —
status there is shown read-only with a pointer to the action buttons; status
is still offered at creation time, since a brand-new hearing legitimately
needs *some* initial status (defaults to `scheduled`) and there's no history
to bypass yet. Next-hearing-date fields were removed from `HearingForm`
entirely and live exclusively in `HearingTransitionForm.jsx`, which backs
the 6 action buttons (Mark Completed / Adjourn / Postpone / Reschedule /
Cancel / No Appearance) plus a separate "Add Next Hearing" button on
`HearingDetail.jsx` (a plain `createHearing` call with `previousHearingId`
set, for adding a hearing without going through a transition).

**"+ Add Note" is real; "+ Add Document"/"+ Add Evidence" stayed disabled
placeholders** on the Case Overview page — Notes needed no unbuilt
subsystem (plain embedded subdocument); Documents/Evidence need the Module 4
upload pipeline first. The spec explicitly allows this split.

See `docs/MODULE3_CASES.md` for the full API reference and testing checklist.

## Document Management (Module 4, Phase 1)

**Model**: `Document` (`backend/src/models/Document.js`) is a separate
collection, many-per-case via `caseId`. `docType` is free-text (FIR,
complaint, statement, chargesheet, court document, …) — not an enum, same
pattern as `Case.caseType`. `status` is `pending`/`processing`/`completed`/
`failed`; Phase 1 only ever sets `pending` (the rest are driven by the Phase 2
OCR/chunking pipeline).

**Server-side internals stay off the wire.** `storagePath` is a
server-generated relative path (`<caseId>/<randomName>`) that is never
derived from user input (so no traversal) and is excluded from all JSON
responses — `select: false` at the query level plus a `toJSON` transform so
the create response hides it too. `extractedText` is likewise `select: false`
so a populated text blob can't bloat list/detail payloads. `downloadDocument`
is the only code path that re-selects `storagePath`, resolves it inside the
uploads root, bounds-checks it, and streams it via `res.download`.

**Routes** (`documentRoutes.js`, mounted at
`/api/cases/:caseId/documents`): `POST` (multi-file, multer disk storage,
field `documents` + optional `docType` applying to all files), `GET` (list,
excludes soft-deleted, sorted `-createdAt`), `GET /:documentId`,
`DELETE /:documentId` (soft delete), `GET /:documentId/download`. Every route
runs `protect → loadCase → requireCaseAccess` — identical to Hearings; there
is no flat `/documents` route. Access = case creator / `assignedUsers` / admin
only. Uploads land in gitignored `uploads/<caseId>/` (`UPLOADS_DIR` env,
default `<repo>/backend/uploads`); dirs created on demand. Allowed formats:
PDF, PNG, JPG/JPEG, DOCX, TXT (extension must be known AND declared MIME must
match or be `application/octet-stream`/empty); 25 MB/file, 10 files/request.
Multer errors (`LIMIT_FILE_SIZE` etc.) map to clean `400`s via a new
`MulterError` branch in `errorMiddleware.js` — no second error-handling
pattern.

**Soft-delete asymmetry with Hearings, intentionally**: a deleted document is
`404` on detail AND download (nothing links to a deleted document, and
download must refuse it). This differs from Hearings, which stay fetchable by
ID because `previousHearingId`/Timeline links point at them. The physical file
is kept on disk (permanent removal deferred to a later phase / cleanup job).

**Events**: `DOCUMENT_UPLOADED` (one per file, `metadata: { documentId,
fileName, size }`) and `DOCUMENT_DELETED` added to `CaseEvent` (now 27 types).
Frontend `config/caseEventIcons.js` maps them to `FileUp`/`FileX` — the only
frontend change in this phase.

**`GET /cases/:id` stats**: `documentCount` is now counted from the real
`Document` collection (`{ caseId, isDeleted: { $ne: true } }`); `evidenceCount`
remains `0` (Evidence not implemented).

See `docs/MODULE4_DOCUMENTS.md` for the full API reference and verification
results.

## Document Management (Module 4, Phase 2) — processing pipeline

The Phase 1 foundation is unchanged (upload, storage, soft-delete, access
control) and now sits on top of a full pipeline owned by a **background
worker in the backend** that pushes each uploaded document through the
stateless **python-ai** service.

**Ownership boundaries (unchanged from the architecture):** MongoDB is the
authoritative metadata store, the filesystem (`uploads/<caseId>/`) is the
authoritative uploaded-file store, and ChromaDB (`python-ai/vectorstore/`,
gitignored, regenerable) is the retrieval/vector layer. python-ai never
touches MongoDB or the uploads filesystem — the backend streams the file to
it over HTTP and persists the structured result.

**Backend worker** (`backend/src/services/documentPipelineService.js`, started
in `server.js`): an in-process, MongoDB-polled loop (no Redis/BullMQ — single
instance). Each tick recovers crashed jobs (`processing` stuck past
`DOC_PROCESSING_TIMEOUT_MS` → requeued to `pending`) then processes every
`pending` document sequentially. Claims are atomic
(`findOneAndUpdate({ status: 'pending' }, { status: 'processing' })`), so
restarts/concurrent ticks never double-process. It streams the file to python-ai
`POST /documents/process`, persists the returned ordered page-level text units
into `DocumentPage`, sets `Document.extractedText` (full normalized text),
`pageCount`, `chunkCount`, `status: 'completed'`, and emits
`DOCUMENT_PROCESSING_STARTED` / `DOCUMENT_PROCESSED` /
`DOCUMENT_PROCESSING_FAILED` `CaseEvent`s. **python-ai unreachable is NOT a
document failure** — those docs are requeued to `pending` and retried next
tick, not marked `failed`.

**Status lifecycle**: `pending → processing → completed | failed`. Only the
worker and the `POST /:documentId/process` endpoint (which sets
`failed → pending` for a retry) move a document out of a terminal state.
`processing` is only ever transient; `failed` carries a readable `error`
(from python-ai's `detail`/`error` payload).

**`DocumentPage` model** (`backend/src/models/DocumentPage.js`): ordered
page-level text units — the durable page-provenance layer. `pageNumber` is the
real source-page number (non-contiguous after OCR-empty pages are skipped),
`{ documentId, pageNumber }` is unique, and a document's rows are replaced
wholesale on reprocessing (idempotent). Chunks live **only** in ChromaDB
(metadata: `caseId`, `documentId`, `pageNumber`, `chunkIndex`, `chunkCount`,
`documentName`, `docType`) and can be re-embedded from `DocumentPage` if the
vector store is wiped — that's the documented regeneration story.

**python-ai** (`python-ai/app/`): a real FastAPI service at last. `POST
/documents/process` runs format detection (extension + MIME) → extraction
(PDF text layer via PyMuPDF with per-page OCR fallback when text <
`OCR_MIN_TEXT_CHARS`; DOCX via python-docx; TXT direct; images straight to
OCR) → cleaning (`cleaning_service.py`, conservative — whitespace/control-char
normalization that preserves UTF-8 incl. Kannada) → **page-aware chunking**
(LangChain `RecursiveCharacterTextSplitter` run per page, so a chunk never
crosses a page boundary) → embeddings (`BAAI/bge-small-en-v1.5`, lazy-loaded
and cached) → Chroma upsert. `POST /documents/search` is case-scoped
retrieval infrastructure for Modules 5/6 (NOT Module 5 analysis). Both schemas
accept `language: Literal['en','kn']` per the decisions log.

**New backend endpoints**: `POST /cases/:caseId/documents/:documentId/process`
(requeue for processing, 409 if already `processing`) and
`GET /cases/:caseId/documents/:documentId/pages` (ordered page units). Upload
now accepts a per-file `docTypes` JSON array aligned by index with
`documents[]` (legacy single `docType` still works as a fallback).

**Frontend**: Documents is now a real tab (`CaseDocumentsTab.jsx` + the
per-file-docType `UploadDocuments.jsx` picker), with live status badges,
page/chunk counts, download, soft-delete, and a Retry action on `failed`
docs. The list auto-polls every 4 s while any doc is `pending/processing` and
stops when everything settles. The Overview "+ Add Document" button now links
to the tab.

**Tesseract is a system dependency, not a pip package.** pytesseract shells out
to a `tesseract` binary; the location is configurable via `TESSERACT_CMD`
(`python-ai/app/core/config.py`). On this machine tesseract was absent — the
AI service's OCR path fails documents with a clear error until it's installed
(`sudo apt install -y tesseract-ocr`, plus `tesseract-ocr-kan` later for
Kannada — the Kannada language code is `kan`, so the OCR language is selected
with `OCR_LANG=kan` or `OCR_LANG=kan+eng` for mixed documents). Verifications
used a portable tesseract extracted from Ubuntu .debs.

## Case Analysis (Module 5, Phase 3) — legal-document analysis layer

Built on top of the unchanged Module 4 pipeline. Analyzes a case's *processed*
documents (status `completed`, non-deleted) and persists a structured, per-case
analysis with a per-document breakdown.

**`CaseAnalysis` model** (`backend/src/models/CaseAnalysis.js`): **one record
per case** (`caseId` unique) — re-running analysis replaces it (idempotent).
Status lifecycle `pending → processing → completed | failed`, synchronous for
this checkpoint but with the `status` field retained so a later module can
convert to a background worker without redesigning the model. Analysis never
lives on the `Case` model (the neutral Module 3 entity stays untouched) and
never lives in ChromaDB (vectors are retrieval; analysis is a persisted
structured artifact).

**Provenance is strict.** `timeline`, `entities`, `laws`, and per-document
summaries carry `sourceDocumentId` + `pageNumber` wherever the LLM anchored
them. The python-ai layer validates a cited page against the pages it actually
received — a page number the LLM could not have seen is dropped to `null`,
never kept. `laws` also carries `equivalent` (e.g. `"BNS 318(4)"` for an
`IPC 420` mention), populated **only** from the curated reference data — an
unknown equivalence stays explicitly empty, never invented.

**Backend orchestration**: `analysisService.js` builds the python-ai payload
from the authoritative `DocumentPage` page units (capped at `ANALYSIS_MAX_CHARS`,
whole pages dropped from the end, never cut mid-page) and calls python-ai
`POST /analysis/case`. `analysisController.js` owns the record lifecycle and
the `AI_ANALYSIS_STARTED` / `AI_ANALYSIS_COMPLETED` / `AI_ANALYSIS_FAILED`
`CaseEvent`s. python-ai unreachable → clean `502`; pipeline/LLM error → `422`;
both persist the failed record before returning, so a failure is never left
marked `completed`. Only processed documents are analyzable; none → `400`.

**python-ai analysis layer** (`analysis_service.py`, `llm_service.py`,
`rag_service.py`, `nlp/ipc_bns_map.py`):
- `llm_service.py` — Gemini wrapper (JSON-only extraction). Provider behind
  `LLM_PROVIDER`: `gemini` (needs `GEMINI_API_KEY`) or `stub` (deterministic
  canned output, with real Kannada text when `language='kn'`) so the full
  pipeline is testable without an API key.
- **Kannada**: detected deterministically by Unicode block (U+0C80–U+0CFF).
  When Kannada appears anywhere in the case text, the English-only Chroma
  retrieval grounding is bypassed entirely and analysis uses the authoritative
  full page text. `language` (`en`/`kn`) selects the narrative output language;
  Gemini is multilingual so Kannada summaries/labels work. UTF-8 preserved
  end-to-end.
- `rag_service.py` — English-only **optional** grounding: reuses the existing
  case-scoped Chroma search (Module 4 vector layer, unchanged); retrieved
  excerpts are appended to the prompt. Degrades gracefully to full text on any
  retrieval failure. `ANALYSIS_USE_RETRIEVAL` / `ANALYSIS_TOP_K` knobs.
- `nlp/ipc_bns_map.py` — **curated, source-verified** IPC↔BNS correspondence
  (base-section level; BPRD correspondence table + 2025-verified references).
  `normalize_law()` emits the `equivalent` cross-reference only from this data.

**The bge-small-en-v1.5 limitation is intentionally NOT addressed in Phase 3.**
Analysis is an LLM task over authoritative text; the English-oriented embedding
model only powers similarity search, which is at most optional English-only
grounding and is bypassed for Kannada. A multilingual embedding model +
re-embedding is a Module 6 concern.

**Frontend**: `ai-analysis` and `laws` are now real case tabs
(`CaseAIAnalysisTab.jsx`, `CaseLawsTab.jsx`, moved from `COMING_SOON_TABS` to
`REAL_TABS` in `CaseDetailLayout.jsx`; routes in `AppRoutes.jsx`). The AI
Analysis tab has Generate/Regenerate (language follows the app's i18n language),
empty/loading/failed/completed states, summary + key points, document timeline,
entities grouped by type, applicable laws with `≈ BNS …` equivalents, and a
per-document accordion with sources. The Laws tab renders the applicable-laws
view from the same record. `services/analysisService.js` wraps the two
endpoints. `config/caseEventIcons.js` maps the three AI analysis events
(`Loader2` / `Sparkles` / `AlertTriangle`).

## What's real vs scaffolded right now

**Real, end to end:** register/login/logout/refresh/profile-edit, dark mode,
language switching (en/kn, persisted), sidebar/topbar navigation shell,
responsive collapse + mobile drawer, **full case CRUD (create/view/edit/
soft-delete+undelete/archive/restore/status-change/pin), parties, editable
notes, hearings (create/edit/soft-delete + atomic numbering + full 7-status
lifecycle via the guided transition action + Case.nextHearingDate kept
correct by recalculateNextHearingDate), case search/filter, event-log-backed
timeline and activity feed, **document upload + full processing pipeline
(OCR → extraction → page units → chunking → embeddings → ChromaDB) with
status lifecycle, page/chunk counts, download, soft-delete, and a Documents
tab + per-file-docType upload UI, and the Module 5 Phase 3 case-analysis
layer (synchronous, per-case `CaseAnalysis` with strict page/document
provenance, curated IPC↔BNS equivalents, Kannada-aware with retrieval bypass,
and real AI Analysis + Applicable Laws case tabs).**

**Scaffolded, clearly labeled in-UI (not faked as working):**
- Case-workspace chat/rich-cards — still only the `/app/cases/preview` sample screen; real cases use the (currently real, non-AI) Smart Case Folder tabs instead
- Evidence, Witnesses, Judgments, Courtroom Strategy, Reports — per-case tabs, generic `CaseComingSoonTab`
- **Documents — fully REAL (Module 4 complete): backend model + API, disk upload, soft-delete, download, `documentCount`, the Phase 2 processing pipeline (OCR → extraction → page units → chunking → embeddings → ChromaDB) via the python-ai service, and the frontend Documents tab with per-file-docType upload, status badges, retry, and auto-polling.**
- **AI Analysis + Applicable Laws case tabs — fully REAL (Module 5 Phase 3): per-case `CaseAnalysis` (summary + key points, document timeline, entities, IPC/BNS/BNSS/BSA laws with curated `equivalent`s, per-document breakdown), synchronous Generate/Regenerate via `POST /cases/:caseId/analysis`, Kannada-aware output, retrievalUsed flag.**
- All 13 Legal Research Center tools and 6 of 7 Practice Management tools (Hearings has per-case functionality now; the rest are still placeholders) — generic `ComingSoonView`
- Global search — captures and displays the query, doesn't hit a real index
- Case/hearing Activity — real events from `CaseEvent`, not a full field-level audit log (see Module 3 section above)

## Key decisions log

- **Auth**: access token in memory only (never localStorage), httpOnly
  refresh cookie, rotation + reuse detection on every `/auth/refresh`. See
  `docs/MODULE2_AUTH.md`.
- **i18n**: react-i18next with locale JSON bundled at build time (no runtime
  fetch backend), namespaced `common` / `nav` / `auth`. Language persisted to
  `localStorage`, auto-detected from the browser on first visit. Adding a
  language = new `locales/<code>/*.json` folder + one entry in
  `i18n/config.js` — no component changes, since every component reads
  labels through `t()` keys.
- **Kannada translations** were written directly for nav labels, common
  actions, and the auth forms — not machine-translated after the fact.
  Legal-domain terms (BNS/BNSS/BSA, court names) should get a native-speaker
  / legal review pass before this is used in a real submission — flagged,
  not silently assumed correct.
- **Layout split**: the sidebar/topbar chrome only wraps authenticated
  `/app/*` routes; Landing/Login/Register keep the simpler public `Navbar` —
  a logged-out visitor shouldn't see 25 nav items.
- **AI backend language parameter**: not implemented yet (python-ai has no
  endpoints until Module 3), but every Pydantic request schema from Module 3
  onward should accept a `language: Literal['en', 'kn']` field threaded
  through from the frontend's current i18n language, so responses can
  eventually come back in the user's chosen language. Noted here so it isn't
  forgotten when Module 3/4 schemas get designed.
- **Documents (Module 4 Phase 1)**: `storagePath`/`extractedText` are never
  serialized to clients (`select: false` + `toJSON` transform) — the server's
  on-disk layout stays off the wire. `docType` is free text. Uploaded files
  get server-generated random names with their real extension (never the
  user's `originalName`), so no user string reaches the filesystem. Soft
  delete keeps the physical file; permanent removal is deferred. Uploaded
  documents are still reachable on a soft-deleted case (same as Hearings —
  `loadCase` doesn't filter `isDeleted`).
- **Documents (Module 4 Phase 2)**: the pipeline is orchestrated by a backend
  background worker (MongoDB-polled, atomic claims, crash recovery, no
  Redis) and executed by the stateless python-ai service, preserving the
  single-ownership boundary (Mongo = metadata, filesystem = files, Chroma =
  vectors). Page-level text units persist in `DocumentPage` (page provenance);
  chunks live only in ChromaDB and are re-embeddable from pages. Chunking is
  page-aware — a chunk never crosses a page boundary. python-ai unreachable
  requeues rather than fails a document. Tesseract is a system dependency
  (not a pip package); its binary path is `TESSERACT_CMD`-configurable.
- **Case lifecycle/status update (August 2026)**: `transferred` is a real
  `Case.status` value. The backend enum is
  `ongoing | won | lost | transferred | closed`; `isArchived` remains an
  orthogonal boolean and is not a status value. In the UI, `closed` is presented
  as the `Other` category under Closed Cases.
- **Closed Cases navigation (August 2026)**: the sidebar contains only the
  top-level case workspace views. Won/Lost/Transferred/Other are selected from
  the Closed Cases page and use the corresponding status-filtered list routes.
- **Analysis (Module 5 Phase 3)**: synchronous by design, but the
  `CaseAnalysis.status` field uses the same pending/processing/completed/failed
  lifecycle as `Document` so a later module can switch to a background worker
  without redesigning the model. Analysis runs only over `completed`,
  non-deleted documents, reads the authoritative `DocumentPage` units (never
  `extractedText`), and never touches ChromaDB for writes. Provenance is
  validated client-side in python-ai: cited page numbers must be pages the LLM
  actually received, or they are dropped to `null`. The LLM is behind
  `LLM_PROVIDER` (`gemini` | `stub`) so acceptance tests run without a key.
- **IPC↔BNS equivalences (Module 5 Phase 3)**: only the curated, source-verified
  reference data in `python-ai/app/nlp/ipc_bns_map.py` is ever emitted as a
  law's `equivalent`; an unknown equivalence stays explicitly empty. The map is
  base-section-level (BNS restructured IPC sub-sections) and flagged for a
  legal review pass, consistent with the Kannada-terminology follow-up.
- **Multer errors** are mapped in the centralized `errorMiddleware.js`
  (`MulterError` → clean `400`s), not handled per-route — the upload feature
  introduces no second error-handling pattern.

## i18n coverage — what's done vs outstanding

Fully translated: Sidebar, TopBar (search/language/notifications/profile
menus), Navbar, LoginForm, RegisterForm, Login, Register pages.

**Not yet retrofitted** (still English-only, tracked as follow-up, not
silently skipped): `Profile.jsx` labels/form, and some `Landing.jsx` body
copy (capability card descriptions).

## Environment variables added this session

- `UPLOADS_DIR` (optional, Module 4) — root directory for uploaded case
  documents; defaults to `<repo>/backend/uploads` when unset. Added to
  `backend/.env.example`.
- `DOC_PIPELINE_POLL_INTERVAL_MS`, `DOC_PROCESSING_TIMEOUT_MS` (backend,
  Module 4 Phase 2) — worker poll interval and crashed-job requeue threshold.
  Added to `backend/.env.example`; read by `backend/src/config/env.js`
  (`env.docPipeline.*`).
- python-ai (Module 4 Phase 2): `EMBEDDING_MODEL`, `CHROMA_PERSIST_DIR`,
  `CHROMA_COLLECTION`, `OCR_MIN_TEXT_CHARS`, `OCR_RASTER_DPI`, `TESSERACT_CMD`,
  `OCR_LANG` (Tesseract language(s), e.g. `eng`, `kan`, or `kan+eng` — needs
  the matching `tesseract-ocr-<code>` traineddata, `kan` included in
  `tesseract-ocr-kan` on Ubuntu 24.04), `CHUNK_SIZE`, `CHUNK_OVERLAP`,
  `BACKEND_SERVICE_URL` — added to `python-ai/.env.example`, read by
  `python-ai/app/core/config.py`.
- `ANALYSIS_MAX_CHARS` (backend, Module 5 Phase 3) — cap on the document text
  streamed to python-ai for one analysis (whole pages dropped from the end).
  Added to `backend/.env.example`; read by `backend/src/config/env.js`
  (`env.analysis.maxChars`).
- python-ai (Module 5 Phase 3): `LLM_PROVIDER` (`gemini` | `stub`),
  `GEMINI_MODEL`, `ANALYSIS_USE_RETRIEVAL`, `ANALYSIS_TOP_K` — added to
  `python-ai/.env.example`, read by `python-ai/app/core/config.py`
  (`settings.llm_provider`, `settings.gemini_model`,
  `settings.analysis_use_retrieval`, `settings.analysis_top_k`).

## Developer handoff — ready for Module 6

This is the current stable handoff point.

### Completed before Module 6

- Module 1 — Architecture & scaffolding
- Module 2 — Authentication
- Architecture update — sidebar/topbar shell, i18n, IA restructuring
- Module 3 — Case Management + Smart Case Folder + Hearing Management
- Module 4 — Document upload and processing pipeline
- Module 5 Phase 3 — AI legal-document case analysis
- Case Workspace navigation/status UX update described above

### Important Module 5 implementation state

AI case analysis is real end-to-end:

```text
Frontend
  → backend POST /api/cases/:caseId/analysis
  → backend builds payload from authoritative DocumentPage units
  → python-ai POST /analysis/case
  → Gemini or deterministic stub
  → normalized structured result
  → CaseAnalysis persisted in MongoDB
  → AI Analysis + Applicable Laws tabs
```

The Module 5 analysis layer includes:

- case summary and key points
- document-derived timeline
- entities
- applicable laws
- curated IPC ↔ BNS equivalents
- strict document/page provenance
- per-document analysis
- Kannada detection and Kannada narrative output
- English-only Chroma retrieval bypass when Kannada is present
- synchronous `pending → processing → completed | failed` lifecycle
- AI analysis CaseEvents
- Gemini fallback/automatic model selection and `LLM_PROVIDER=gemini|stub`

### Important Module 4 boundary

Do not redesign or bypass the existing Module 4 ownership boundary:

- MongoDB = authoritative metadata/page text
- backend filesystem = uploaded files
- ChromaDB = retrieval/vector layer
- python-ai = stateless processing/AI service

Chunks are re-embeddable from `DocumentPage`; python-ai does not write MongoDB.

### Current service layout

```text
~/LawGPT/
├── backend/       Express + MongoDB API       :5000
├── python-ai/     FastAPI + ChromaDB + Gemini :8000
├── frontend/      React + Vite + Tailwind     :5173
├── docs/
├── PROJECT_MEMORY.md
└── README.md
```

### First steps for another developer

```bash
cd ~/LawGPT
git checkout main
git pull origin main
git status
```

Then read:

```text
PROJECT_MEMORY.md
docs/ARCHITECTURE.md
docs/MODULE3_CASES.md
docs/MODULE4_DOCUMENTS.md
docs/MODULE5_ANALYSIS.md
```

Before starting Module 6, verify the working tree is clean and the latest
`main` branch contains the Module 5 checkpoint plus the Case Workspace update.

Recommended local service checks:

```bash
curl -s http://localhost:5000/health
curl -s http://localhost:8000/health
curl -s http://localhost:5173
```

Module 6 is the next planned module:

**Similar judgments (RAG)** — also backing Judge Research, Constitution,
Supreme/High Court, Judgment Search, Case Comparison, and Legal Dictionary.

Do not treat the remaining scaffolded modules as completed just because their
routes exist. Check the status tables and "What's real vs scaffolded" section
before extending them.

---

## Open follow-ups

1. Full i18n coverage of `Profile.jsx` and remaining `Landing.jsx` copy — the Module 3 case-management pages are also English-only for now, same reasoning (kept moving on functional scope first, tracked here rather than silently skipped).
2. **Module 4 is complete.** Remaining document-pipeline polish (all out of scope by design): a page-preview in the Documents tab (the `GET /:id/pages` endpoint already serves the data), physical-file deletion / Trash / restore UI (still `404` after soft-delete, file retained on disk), and the OCR "scanned PDF" path is verified but a scanned-PDF fixture should be exercised on a machine with tesseract installed via `apt`.
3. Kannada legal-terminology review before real submission/demo use.
4. `language` threading from the frontend into python-ai calls — **partially closed by Module 5 Phase 3**: the analysis feature threads the frontend i18n language into `POST /cases/:caseId/analysis` → `POST /analysis/case` (`en`/`kn`), and Kannada output is preserved. Still open: the Module 4 **document pipeline** hardcodes `language=en` (OCR language is globally configurable via `OCR_LANG`, e.g. `kan` or `kan+eng`), and **per-document** language routing + a multilingual embedding model remain natural next steps (the current `BAAI/bge-small-en-v1.5` model is English-only and does not meaningfully embed Kannada text).
5. **Module 5 Phase 3 is complete.** Remaining Module 5 work (out of scope by design, per the phase plan): the BNS / BNSS / BSA Legal Research Center sidebar pages, which this phase's analysis output can later back.
5. Full field-level audit log (who changed which field, old → new value) for the case Activity tab — `CaseEvent` logs *that* something changed and a human-readable title, but not a structured before/after diff for every field.
6. Cross-case Hearings calendar (Practice Management sidebar) — per-case hearings are real; this aggregation view is not.
7. Multi-user case assignment UI — `Case.assignedUsers` exists at the data layer and defaults to `[createdBy]`, but there's no picker to assign a case to a colleague yet (would need a "list org users" endpoint that doesn't exist).
8. **No dedicated Trash UI.** Case soft-delete has a restore *banner* (if you land on a deleted case's own URL) but no browsable list of your deleted cases. Hearing soft-delete has neither a restore endpoint nor any UI — a deleted hearing's document still exists in MongoDB (not unrecoverable), but nothing in the app can undelete it yet. Documents (Module 4) have the same gap: deleted documents are `404` on detail/download and the physical file is retained but unrecoverable through the app. All three are intentionally out of scope for now, not oversights.
9. `hearingCounter` on `Case` is internal bookkeeping (`select: false`) — if a future migration or bulk-import script inserts hearings directly (bypassing `createHearing`), it must also bump this counter, or the next real `createHearing`/`transitionHearing` call could collide with the unique index.

## Core-workflow completion pass (October 2026)

Goal: make the six core case workflows run end-to-end even without a live Gemini
key, and remove placeholder navigation from the UI.

### python-ai
- `analysis_service.py` — added a deterministic **extractive** analysis builder,
  used when `LLM_PROVIDER != "gemini"` and as a fallback when a Gemini call fails.
  It reads only the authoritative page text: lead sentences for the summary,
  per-page key points, date-bearing sentences for the timeline (dotted
  `12.04.1987` and ordinal dates included), statute mentions (`Section N`,
  `IPC/BNS/BNSS/BSA N`) with the containing sentence as `relevance`, Act-name
  labelling for non-penal statutes, and statute/date/amount/person entities.
  IPC↔BNS `equivalent` still comes only from `nlp/ipc_bns_map.py`.
- `chat_service.py` — the prompt now carries the **case record** (metadata +
  `CaseAnalysis` summary/key points/laws) beside retrieved chunks. The
  distance→similarity conversion now respects the collection metric: the
  document collection is squared-L2, so similarity is `1 - d/2`, not `1 - d`
  (the old conversion wiped out every real hit's score and dropped all
  citations). With neither chunks nor a case record, the LLM is still never
  called; with a case record it answers from case data and states plainly that
  no documents are indexed.
- `chat.py` / `chat_schemas.py` — optional `case_context` request field.
- `embedding_service.py` — the real `BAAI/bge-small-en-v1.5` model is the
  default again (opt out with `LAWGPT_DISABLE_EMBEDDING_DOWNLOAD=true`); the
  deterministic fallback vectors remain for offline machines. Existing Chroma
  chunks embedded with fallback vectors should be reprocessed once.
- `judgment_service.py` — section filters match section numbers
  ("IPC Section 420" vs seeded "Section 420 IPC"), not just literal substrings.

### backend
- `chatController.js` — streams case metadata + analysis to python-ai.
- `researchController.js` — section filters use only IPC/BNS/BNSS/BSA; an
  unfiltered fallback runs when the filter starves the small seeded corpus.

### frontend
- Case tabs are now only real features: Overview, Timeline, Hearings, Documents,
  Judgments, AI Analysis, Applicable Laws, Arguments, Chat, Reports, Parties,
  Notes, Activity.
- Deleted `ComingSoonView.jsx`, `CaseComingSoonTab.jsx`,
  `CaseWorkspacePreview.jsx`. `/app/case/:caseId/:section` redirects to the
  overview; `/app/cases/preview` redirects to the ongoing case list.
- The sidebar links only tools with a working implementation (`live: true` in
  `config/toolsRegistry.js`); the Practice Management section is hidden until
  one of its tools exists.
- Chat: legal quick-prompt chips, loading states, expandable source citations.
- Reports: `Preview` renders the generated PDF inline before downloading.

### Verification (MongoDB + backend:5000 + python-ai:8000)
- `python -m pytest python-ai/tests` → 16 passed
- `node --check` on every backend file → clean; `npm test` loads the app
- `npm run build` (frontend) → success (ESLint has no config file in the repo,
  so `npm run lint` cannot run)
- `backend/scripts/runFullPipelineTest.js` → exit 0: analysis (698-char summary,
  12 timeline events, 25 entities, 7 laws), 5 precedents, 3 petitioner grounds +
  2 respondent rebuttals, chat with 3 citations, 21.8 KB PDF report
- Browser check: tab list, `/evidence` → overview redirect, chat citation cards,
  inline report preview, sidebar showing only working research tools
