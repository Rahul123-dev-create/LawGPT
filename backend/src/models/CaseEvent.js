const mongoose = require('mongoose');

/**
 * Initial set per the Module 3 correction, plus a few pragmatic additions
 * for lifecycle actions that already exist in this module (party/note
 * edits, pin, case update, soft-delete) — logging those consistently is
 * what makes "what changed and when" actually answerable later, which is
 * the whole point of this model. DOCUMENT_UPLOADED / DOCUMENT_DELETED were
 * added with Module 4 Phase 1 (document upload pipeline foundation);
 * DOCUMENT_PROCESSING_STARTED / DOCUMENT_PROCESSED /
 * DOCUMENT_PROCESSING_FAILED with Phase 2 (OCR → extraction → chunking →
 * embeddings → vector store). AI_ANALYSIS_STARTED / AI_ANALYSIS_COMPLETED /
 * AI_ANALYSIS_FAILED were added with Module 5 Phase 3 (case analysis of the
 * processed legal documents). ARGUMENTS_GENERATION_STARTED /
 * ARGUMENTS_GENERATION_COMPLETED / ARGUMENTS_GENERATION_FAILED were added with
 * Module 7 (adversarial arguments + evidence scoring).
 * Deliberately NOT adding placeholder types for subsystems that don't exist
 * yet (EVIDENCE_ADDED, WITNESS_ADDED, etc.) — those get added when their
 * module lands.
 */
const EVENT_TYPES = [
  'CASE_CREATED',
  'CASE_UPDATED',
  'CASE_STATUS_CHANGED',
  'CASE_ARCHIVED',
  'CASE_RESTORED',
  'CASE_DELETED',
  'CASE_UNDELETED',
  'CASE_PINNED',
  'CASE_UNPINNED',
  'PARTY_ADDED',
  'PARTY_UPDATED',
  'PARTY_REMOVED',
  'NOTE_ADDED',
  'NOTE_UPDATED',
  'NOTE_DELETED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
  'DOCUMENT_PROCESSING_STARTED',
  'DOCUMENT_PROCESSED',
  'DOCUMENT_PROCESSING_FAILED',
  'AI_ANALYSIS_STARTED',
  'AI_ANALYSIS_COMPLETED',
  'AI_ANALYSIS_FAILED',
  'ARGUMENTS_GENERATION_STARTED',
  'ARGUMENTS_GENERATION_COMPLETED',
  'ARGUMENTS_GENERATION_FAILED',
  'HEARING_CREATED',
  'HEARING_UPDATED',
  'HEARING_COMPLETED',
  'HEARING_ADJOURNED',
  'HEARING_POSTPONED',
  'HEARING_CANCELLED',
  'HEARING_RESCHEDULED',
  'HEARING_NO_APPEARANCE',
  'HEARING_DELETED',
  'NEXT_HEARING_SCHEDULED',
  'REPORT_GENERATED',
];

const caseEventSchema = new mongoose.Schema(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
    hearingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hearing', default: null },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Free-form extra context per event (e.g. { from: 'ongoing', to: 'won' }
    // for CASE_STATUS_CHANGED). Mixed/untyped on purpose — every event type
    // has a different shape, and this isn't queried structurally, only
    // displayed.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  // Events are an immutable log — no updatedAt, they're never edited.
  { timestamps: { createdAt: true, updatedAt: false } }
);

caseEventSchema.index({ caseId: 1, createdAt: 1 });

const CaseEvent = mongoose.model('CaseEvent', caseEventSchema);

module.exports = CaseEvent;
module.exports.EVENT_TYPES = EVENT_TYPES;
