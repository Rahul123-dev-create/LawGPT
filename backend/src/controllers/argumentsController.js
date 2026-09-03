const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const Case = require('../models/Case');
const Document = require('../models/Document');
const DocumentPage = require('../models/DocumentPage');
const CaseAnalysis = require('../models/CaseAnalysis');
const CaseArguments = require('../models/CaseArguments');
const { buildArgumentsPayload, generateArguments } = require('../services/argumentsService');
const { logCaseEvent } = require('../services/caseEventService');

/**
 * Module 7 — structured legal argument generation & evidence strength scoring.
 *
 * Synchronous lifecycle (same pattern as analysisController.js):
 * POST creates/replaces the CaseArguments record (pending → processing →
 * completed | failed) and returns the result. GET retrieves the latest.
 */

// POST /api/cases/:caseId/arguments/generate
const generateCaseArguments = asyncHandler(async (req, res) => {
  const caseDoc = req.case;

  // Completed documents required (same check as analysisController).
  const documents = await Document.find({
    caseId: caseDoc._id,
    isDeleted: { $ne: true },
    status: 'completed',
  });
  if (documents.length === 0) {
    throw ApiError.badRequest(
      'This case has no processed documents yet. Upload and process at least one document first.'
    );
  }

  // Authoritative page units (DocumentPage).
  const pagesByDocument = new Map();
  const allPages = await DocumentPage.find({ caseId: caseDoc._id }).sort('pageNumber');
  for (const page of allPages) {
    const key = page.documentId.toString();
    if (!pagesByDocument.has(key)) pagesByDocument.set(key, []);
    pagesByDocument.get(key).push({ pageNumber: page.pageNumber, text: page.text, charCount: page.charCount });
  }

  // CaseAnalysis provides the summary/keyPoints/laws context for arguments.
  const analysis = await CaseAnalysis.findOne({ caseId: caseDoc._id });

  // Claim the record: create-or-replace and put in 'processing'.
  const argsRecord = await CaseArguments.findOneAndUpdate(
    { caseId: caseDoc._id },
    {
      $set: {
        createdBy: req.user._id,
        status: 'processing',
        generationMode: 'deterministic',
        error: '',
        generatedAt: null,
        arguments: { petitioner: [], respondent: [] },
        evidenceScores: [],
        summaryMetrics: {},
      },
    },
    { upsert: true, new: true }
  );

  await logCaseEvent({
    caseId: caseDoc._id,
    eventType: 'ARGUMENTS_GENERATION_STARTED',
    title: 'Argument generation started',
    description: `Generating structured arguments from ${documents.length} document(s).`,
    createdBy: req.user._id,
    metadata: { documentCount: documents.length },
  });

  const payload = buildArgumentsPayload({ caseDoc, documents, pagesByDocument, analysis });

  let result;
  try {
    result = await generateArguments(payload);
  } catch (err) {
    argsRecord.status = 'failed';
    argsRecord.error = err.message || 'Argument generation failed';
    argsRecord.generatedAt = new Date();
    await argsRecord.save();

    await logCaseEvent({
      caseId: caseDoc._id,
      eventType: 'ARGUMENTS_GENERATION_FAILED',
      title: 'Argument generation failed',
      description: argsRecord.error,
      createdBy: req.user._id,
      metadata: { error: argsRecord.error },
    });

    throw err;
  }

  // Persist the completed result.
  argsRecord.status = 'completed';
  argsRecord.generationMode = result.generationMode || 'deterministic';
  argsRecord.arguments = result.arguments || { petitioner: [], respondent: [] };
  argsRecord.evidenceScores = result.evidenceScores || [];
  argsRecord.summaryMetrics = result.summaryMetrics || {};
  argsRecord.error = '';
  argsRecord.generatedAt = new Date();
  await argsRecord.save();

  await logCaseEvent({
    caseId: caseDoc._id,
    eventType: 'ARGUMENTS_GENERATION_COMPLETED',
    title: 'Argument generation completed',
    description: `${argsRecord.arguments.petitioner?.length || 0} petitioner ground(s), ${argsRecord.arguments.respondent?.length || 0} respondent rebuttal(s), ${argsRecord.evidenceScores.length} document(s) scored.`,
    createdBy: req.user._id,
    metadata: {
      petitionerCount: argsRecord.arguments.petitioner?.length || 0,
      respondentCount: argsRecord.arguments.respondent?.length || 0,
      evidenceCount: argsRecord.evidenceScores.length,
      generationMode: argsRecord.generationMode,
    },
  });

  return new ApiResponse(201, 'Arguments generated', { arguments: argsRecord }).send(res);
});

// GET /api/cases/:caseId/arguments
const getCaseArguments = asyncHandler(async (req, res) => {
  const argsRecord = await CaseArguments.findOne({ caseId: req.case._id });
  if (!argsRecord) throw ApiError.notFound('No arguments have been generated for this case yet');
  return new ApiResponse(200, 'Arguments retrieved', { arguments: argsRecord }).send(res);
});

module.exports = { generateCaseArguments, getCaseArguments };
