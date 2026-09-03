const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Module 7 — calls python-ai's stateless argument generation service.
 *
 * Same ownership boundary as analysis (Module 5): MongoDB is the authoritative
 * store, the backend assembles the payload from Case/Document/DocumentPage/
 * CaseAnalysis records, streams it to python-ai, and persists the result into
 * the CaseArguments collection.
 */

const ARGUMENTS_CALL_TIMEOUT_MS = 5 * 60 * 1000;

function isConnectionError(err) {
  if (err.response) return false;
  return Boolean(err.request || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT');
}

function extractError(err) {
  const raw =
    err.response?.data?.error ?? err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof raw === 'string') return raw.slice(0, 2000);
  try {
    return JSON.stringify(raw).slice(0, 2000);
  } catch (_e) {
    return String(raw).slice(0, 2000);
  }
}

/**
 * Builds the python-ai arguments request from the case's data.
 * Uses CaseAnalysis for summary/keyPoints/laws (Module 5 output) and
 * DocumentPage for authoritative page text (Module 4 output).
 */
function buildArgumentsPayload({ caseDoc, documents, pagesByDocument, analysis }) {
  const maxChars = env.analysis.maxChars;
  const requestDocuments = [];
  let budget = maxChars;
  let truncated = false;

  for (const document of documents) {
    const pages = pagesByDocument.get(document._id.toString()) || [];
    const kept = [];
    for (const page of pages) {
      const size = page.text.length;
      if (budget <= 0) {
        truncated = true;
        break;
      }
      if (size > budget) {
        truncated = true;
        break;
      }
      kept.push({ pageNumber: page.pageNumber, text: page.text, charCount: page.text.length });
      budget -= size;
    }
    if (pages.length > kept.length) truncated = true;

    requestDocuments.push({
      documentId: document._id.toString(),
      documentName: document.originalName,
      docType: document.docType || '',
      pages: kept,
    });
  }

  return {
    caseId: caseDoc._id.toString(),
    caseSummary: analysis?.summary?.text || '',
    keyPoints: analysis?.summary?.keyPoints || [],
    laws: (analysis?.laws || []).map((l) => ({
      code: l.code,
      section: l.section,
      label: l.label,
      description: l.description,
      relevance: l.relevance,
    })),
    documents: requestDocuments,
  };
}

/** Calls python-ai POST /arguments/generate and returns the structured result. */
async function generateArguments(payload) {
  let response;
  try {
    response = await axios.post(`${env.pythonAiServiceUrl}/arguments/generate`, payload, {
      timeout: ARGUMENTS_CALL_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (err) {
    if (isConnectionError(err)) {
      logger.warn(`python-ai unreachable for arguments (case ${payload.caseId}): ${err.code || err.message}`);
      throw ApiError.badGateway('AI service unreachable — argument generation failed');
    }
    const detail = extractError(err);
    logger.warn(`Argument generation failed (case ${payload.caseId}): ${detail}`);
    throw ApiError.unprocessable(detail || 'Argument generation failed');
  }

  const data = response.data;
  if (!data || typeof data !== 'object') {
    throw ApiError.unprocessable('Argument generation returned an empty result');
  }
  return data;
}

module.exports = { buildArgumentsPayload, generateArguments, ARGUMENTS_CALL_TIMEOUT_MS };
