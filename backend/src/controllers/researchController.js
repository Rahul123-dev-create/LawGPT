const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const CaseAnalysis = require('../models/CaseAnalysis');
const env = require('../config/env');
const logger = require('../utils/logger');

const axios = require('axios');

const RESEARCH_TIMEOUT_MS = 60 * 1000;

function isConnectionError(err) {
  if (err.response) return false;
  return Boolean(err.request || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT');
}

function extractError(err) {
  const raw = err.response?.data?.detail ?? err.response?.data?.message ?? err.response?.data?.error ?? err.message;
  if (typeof raw === 'string') return raw.slice(0, 2000);
  try {
    return JSON.stringify(raw).slice(0, 2000);
  } catch (_e) {
    return String(raw).slice(0, 2000);
  }
}

async function searchPythonJudgments(payload) {
  try {
    const response = await axios.post(`${env.pythonAiServiceUrl}/research/judgments/search`, payload, {
      timeout: RESEARCH_TIMEOUT_MS,
    });
    return response.data;
  } catch (err) {
    if (isConnectionError(err)) {
      logger.warn(`python-ai unreachable for research search: ${err.code || err.message}`);
      throw ApiError.badGateway('AI service unreachable — precedent search failed');
    }
    const detail = extractError(err);
    logger.warn(`Precedent search failed: ${detail}`);
    if (err.response?.status === 400) throw ApiError.badRequest(detail || 'Invalid research query');
    if (err.response?.status === 422) throw ApiError.unprocessable(detail || 'Invalid research query');
    throw ApiError.badGateway(detail || 'Precedent search failed');
  }
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function deriveSectionFilter(analysis) {
  const ranked = uniqueStrings((analysis?.laws || []).map((law) => {
    if (!law?.code || !law?.section) return '';
    return `${law.code} Section ${law.section}`;
  }));
  return ranked[0] || null;
}

function buildCaseResearchQuery(caseDoc, analysis) {
  const parts = [];
  if (caseDoc?.title) parts.push(`Case title: ${caseDoc.title}`);
  if (caseDoc?.description) parts.push(`Case description: ${caseDoc.description}`);
  if (analysis?.summary?.text) parts.push(`Case summary: ${analysis.summary.text}`);

  const keyPoints = uniqueStrings(analysis?.summary?.keyPoints || []);
  if (keyPoints.length) {
    parts.push(`Key issues: ${keyPoints.slice(0, 6).join('; ')}`);
  }

  const statutorySections = uniqueStrings((analysis?.laws || []).map((law) => {
    if (!law?.section) return '';
    return law.code ? `${law.code} Section ${law.section}` : `Section ${law.section}`;
  }));
  if (statutorySections.length) {
    parts.push(`Statutory sections: ${statutorySections.slice(0, 8).join(', ')}`);
  }

  const documentPoints = uniqueStrings(
    (analysis?.documents || []).flatMap((doc) => [doc.summary, ...(doc.keyPoints || [])])
  );
  if (documentPoints.length) {
    parts.push(`Document highlights: ${documentPoints.slice(0, 8).join('; ')}`);
  }

  return parts.join('. ');
}

function buildPracticalApplication(caseDoc, analysis, precedent) {
  const snippets = [];
  const summaryText = analysis?.summary?.text || caseDoc?.description || '';
  if (summaryText) {
    snippets.push(`Use this where the dispute turns on ${summaryText.slice(0, 180).trim()}.`);
  }

  const sections = uniqueStrings(analysis?.laws?.map((law) => (law.code && law.section ? `${law.code} Section ${law.section}` : '')));
  if (sections.length) {
    snippets.push(`It aligns with the case's statutory focus on ${sections.slice(0, 3).join(', ')}.`);
  }

  if (precedent?.ratio_decidendi) {
    snippets.push(`Core ratio: ${precedent.ratio_decidendi}`);
  }

  return snippets.join(' ');
}

// POST /api/research/judgments/search
const searchJudgments = asyncHandler(async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (!query) throw ApiError.badRequest('Query is required');

  const top_k = Math.min(Math.max(parseInt(req.body?.top_k, 10) || 5, 1), 20);
  const section_filter = String(req.body?.section_filter || '').trim() || undefined;

  const data = await searchPythonJudgments({ query, top_k, section_filter });
  return new ApiResponse(200, 'Judgments retrieved', {
    count: data.count || data.results?.length || 0,
    results: data.results || [],
  }).send(res);
});

// GET /api/cases/:caseId/precedents
const getCasePrecedents = asyncHandler(async (req, res) => {
  const caseDoc = req.case;
  const analysis = await CaseAnalysis.findOne({ caseId: caseDoc._id });

  const query = buildCaseResearchQuery(caseDoc, analysis);
  if (!query) {
    throw ApiError.badRequest(
      'This case does not yet have enough descriptive content for precedent retrieval. Add a case description or generate AI analysis first.'
    );
  }

  const sectionFilter = deriveSectionFilter(analysis);
  const data = await searchPythonJudgments({
    query,
    top_k: 5,
    ...(sectionFilter ? { section_filter: sectionFilter } : {}),
  });

  const results = (data.results || []).map((item) => ({
    ...item,
    practical_application: buildPracticalApplication(caseDoc, analysis, item),
  }));

  return new ApiResponse(200, 'Case precedents retrieved', {
    query,
    sectionFilter,
    case: {
      id: caseDoc._id,
      title: caseDoc.title,
      caseNumber: caseDoc.caseNumber,
    },
    analysisSummary: analysis?.summary?.text || '',
    keyPoints: analysis?.summary?.keyPoints || [],
    results,
    count: results.length,
  }).send(res);
});

module.exports = {
  searchJudgments,
  getCasePrecedents,
  buildCaseResearchQuery,
};