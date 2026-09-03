const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const { generateCaseReport } = require('../services/reportService');
const { logCaseEvent } = require('../services/caseEventService');
const Case = require('../models/Case');

/**
 * Module 9 — Report Controller.
 *
 * Streams a PDF case report as a download attachment.
 * Aggregates Case, CaseAnalysis, CaseArguments, Documents, and Hearings
 * into a comprehensive judicial report.
 */

// @desc    Stream a comprehensive PDF case report
// @route   GET /api/cases/:caseId/report/pdf
// @access  Private (owner)
const downloadCaseReport = asyncHandler(async (req, res) => {
  const { caseId } = req.params;

  // Verify case exists and load it for the filename
  const caseDoc = await Case.findById(caseId).lean();
  if (!caseDoc) {
    throw new ApiError(404, 'Case not found');
  }

  const {
    includePrecedents = 'true',
    includeArguments = 'true',
    includeEvidenceScorecard = 'true',
  } = req.query;

  const options = {
    includePrecedents: includePrecedents !== 'false',
    includeArguments: includeArguments !== 'false',
    includeEvidenceScorecard: includeEvidenceScorecard !== 'false',
  };

  let pdfBuffer;
  try {
    pdfBuffer = await generateCaseReport(caseId, options);
  } catch (err) {
    if (err.message === 'Case not found') {
      throw new ApiError(404, 'Case not found');
    }
    throw new ApiError(500, `Failed to generate report: ${err.message}`);
  }

  // Sanitize filename
  const safeCaseNumber = (caseDoc.caseNumber || 'report').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `LawGPT_Report_${safeCaseNumber}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);

  // Log report generation event
  try {
    await logCaseEvent({
      caseId,
      createdBy: req.user._id,
      eventType: 'REPORT_GENERATED',
      title: `Report generated: ${filename}`,
      description: `PDF report downloaded by ${req.user.fullName || req.user.email}`,
      metadata: {
        filename,
        fileSize: pdfBuffer.length,
        options,
      },
    });
  } catch (_e) {
    // Don't fail the download if event logging fails
  }

  res.send(pdfBuffer);
});

// @desc    Get report metadata (available sections, data completeness)
// @route   GET /api/cases/:caseId/report/metadata
// @access  Private (owner)
const getReportMetadata = asyncHandler(async (req, res) => {
  const { caseId } = req.params;

  const [caseDoc, analysis, argumentsData, documentCount, hearingCount] = await Promise.all([
    Case.findById(caseId).lean(),
    require('../models/CaseAnalysis').findOne({ caseId }).lean(),
    require('../models/CaseArguments').findOne({ caseId }).lean(),
    require('../models/Document').countDocuments({ caseId, isDeleted: { $ne: true } }),
    require('../models/Hearing').countDocuments({ caseId, isDeleted: { $ne: true } }),
  ]);

  if (!caseDoc) {
    throw new ApiError(404, 'Case not found');
  }

  const sections = [
    {
      id: 'cover',
      label: 'Cover & Case Details',
      available: true,
    },
    {
      id: 'summary',
      label: 'Executive Summary',
      available: Boolean(analysis?.summary?.text || caseDoc.description),
    },
    {
      id: 'timeline',
      label: 'Chronological Timeline',
      available: Boolean(analysis?.timeline?.length > 0 || hearingCount > 0),
    },
    {
      id: 'entities',
      label: 'Legal Entities',
      available: Boolean(analysis?.entities?.length > 0 || caseDoc.parties?.length > 0),
    },
    {
      id: 'statutes',
      label: 'Statutory Provisions',
      available: Boolean(analysis?.laws?.length > 0),
    },
    {
      id: 'precedents',
      label: 'Judicial Precedents',
      available: Boolean(analysis?.laws?.some((l) => l.relevance)),
    },
    {
      id: 'arguments',
      label: 'Legal Arguments',
      available: argumentsData?.status === 'completed',
    },
    {
      id: 'evidence',
      label: 'Evidence Scorecard',
      available: argumentsData?.status === 'completed',
    },
  ];

  const completeness = Math.round(
    (sections.filter((s) => s.available).length / sections.length) * 100
  );

  res.status(200).json(
    new ApiResponse(200, 'Report metadata retrieved successfully', {
      caseId,
      title: caseDoc.title,
      caseNumber: caseDoc.caseNumber,
      sections,
      completeness,
      documentsCount: documentCount,
      hearingsCount: hearingCount,
      generatedAt: new Date().toISOString(),
    })
  );
});

module.exports = {
  downloadCaseReport,
  getReportMetadata,
};
