const PDFDocument = require('pdfkit');
const Case = require('../models/Case');
const CaseAnalysis = require('../models/CaseAnalysis');
const CaseArguments = require('../models/CaseArguments');
const Document = require('../models/Document');
const Hearing = require('../models/Hearing');

/**
 * Module 9 — PDF Report Generation Engine.
 *
 * Compiles the complete case file into a professional judicial report PDF.
 * Gathers data from Case, CaseAnalysis, CaseArguments, Document, and Hearing
 * models, then streams a formatted PDF through pdfkit.
 */

const COLORS = {
  primary: '#1a1a2e',
  accent: '#16213e',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#f9fafb',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  white: '#ffffff',
};

const FONTS = {
  normal: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
};

/**
 * Build the PDF report buffer from aggregated case data.
 * Returns a Promise<Buffer> that resolves when the PDF is complete.
 */
async function generateCaseReport(caseId, options = {}) {
  const {
    includePrecedents = true,
    includeArguments = true,
    includeEvidenceScorecard = true,
  } = options;

  // ── 1. Aggregate all case data ──────────────────────────────────────────
  const [caseDoc, analysis, argumentsData, documents, hearings] = await Promise.all([
    Case.findById(caseId).lean(),
    CaseAnalysis.findOne({ caseId }).lean(),
    CaseArguments.findOne({ caseId }).lean(),
    Document.find({ caseId, isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean(),
    Hearing.find({ caseId, isDeleted: { $ne: true } }).sort({ hearingDate: 1 }).lean(),
  ]);

  if (!caseDoc) {
    throw new Error('Case not found');
  }

  // ── 2. Create PDF document ──────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      info: {
        Title: `LawGPT Report - ${caseDoc.title}`,
        Author: 'LawGPT Legal Intelligence Platform',
        Subject: `Legal Case Report - ${caseDoc.caseNumber}`,
        Creator: 'LawGPT v1.0',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Cover Header ─────────────────────────────────────────────────────
    renderCoverHeader(doc, caseDoc);

    // ── Section 1: Executive Summary ─────────────────────────────────────
    renderExecutiveSummary(doc, caseDoc, analysis);

    // ── Section 2: Chronological Timeline ────────────────────────────────
    renderTimeline(doc, analysis, hearings);

    // ── Section 3: Legal Entities ────────────────────────────────────────
    renderEntities(doc, caseDoc, analysis);

    // ── Section 4: Statutory Provisions ──────────────────────────────────
    renderStatutoryProvisions(doc, analysis);

    // ── Section 5: Judicial Precedents ───────────────────────────────────
    if (includePrecedents) {
      renderPrecedents(doc, analysis);
    }

    // ── Section 6: Legal Arguments ───────────────────────────────────────
    if (includeArguments) {
      renderArguments(doc, argumentsData);
    }

    // ── Section 7: Evidence Scorecard ────────────────────────────────────
    if (includeEvidenceScorecard) {
      renderEvidenceScorecard(doc, argumentsData, documents);
    }

    // ── Footer: Page numbering + disclaimer ──────────────────────────────
    renderFooter(doc, caseDoc);

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function renderCoverHeader(doc, caseDoc) {
  // Institution header
  doc.rect(0, 0, doc.page.width, 120).fill(COLORS.primary);
  doc.fill(COLORS.white)
     .font(FONTS.bold)
     .fontSize(24)
     .text('LawGPT', 50, 30, { align: 'center' })
     .font(FONTS.normal)
     .fontSize(10)
     .text('Legal Intelligence Platform — Comprehensive Case Report', 50, 58, { align: 'center' })
     .fontSize(8)
     .text('CONFIDENTIAL — PRIVILEGED & CONFIDENTIAL', 50, 75, { align: 'center' });

  doc.fill(COLORS.primary);

  // Case details block
  let y = 140;
  doc.font(FONTS.bold).fontSize(16).text('CASE REPORT', 50, y);
  y += 30;

  const details = [
    ['Case Title', caseDoc.title],
    ['Case Number', caseDoc.caseNumber],
    ['Case Type', caseDoc.caseType],
    ['Court / Jurisdiction', caseDoc.court || 'Not specified'],
    ['State', caseDoc.state || 'Not specified'],
    ['Status', (caseDoc.status || 'ongoing').toUpperCase()],
    ['Priority', (caseDoc.priority || 'medium').toUpperCase()],
    ['Date of Generation', new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Filing Date', caseDoc.filingDate ? new Date(caseDoc.filingDate).toLocaleDateString('en-IN') : 'Not specified'],
  ];

  doc.fontSize(9).font(FONTS.normal);
  for (const [label, value] of details) {
    doc.font(FONTS.bold).text(`${label}: `, 50, y, { continued: true });
    doc.font(FONTS.normal).text(String(value || 'N/A'));
    y += 18;
  }

  // Parties
  if (caseDoc.parties && caseDoc.parties.length > 0) {
    y += 10;
    doc.font(FONTS.bold).fontSize(11).text('PARTIES', 50, y);
    y += 18;
    doc.font(FONTS.normal).fontSize(9);
    for (const party of caseDoc.parties) {
      doc.text(`• ${party.name} — ${party.role} (${party.entityType || 'person'})`, 60, y);
      y += 15;
    }
  }

  doc.moveTo(50, y + 10).lineTo(doc.page.width - 50, y + 10).strokeColor(COLORS.border).stroke();
  doc.moveDown(2);
}

function renderExecutiveSummary(doc, caseDoc, analysis) {
  addSectionHeader(doc, 'SECTION 1: EXECUTIVE CASE SUMMARY & FACTUAL MATRIX');

  if (analysis?.summary?.text) {
    doc.font(FONTS.normal).fontSize(9).text(analysis.summary.text, { lineGap: 4 });
    doc.moveDown(1);
  } else if (caseDoc.description) {
    doc.font(FONTS.normal).fontSize(9).text(caseDoc.description, { lineGap: 4 });
    doc.moveDown(1);
  } else {
    doc.font(FONTS.italic).fontSize(9).text('No case summary available. Run AI Analysis to generate a summary.');
    doc.moveDown(1);
  }

  if (analysis?.summary?.keyPoints && analysis.summary.keyPoints.length > 0) {
    doc.font(FONTS.bold).fontSize(10).text('Key Points:');
    doc.moveDown(0.5);
    doc.font(FONTS.normal).fontSize(9);
    for (const point of analysis.summary.keyPoints) {
      doc.text(`  • ${point}`, { lineGap: 3, indent: 10 });
    }
    doc.moveDown(1);
  }
}

function renderTimeline(doc, analysis, hearings) {
  addSectionHeader(doc, 'SECTION 2: CHRONOLOGICAL DOCUMENT TIMELINE');

  const timelineItems = [];

  // Analysis timeline
  if (analysis?.timeline && analysis.timeline.length > 0) {
    for (const item of analysis.timeline) {
      timelineItems.push({
        date: item.date || 'Unknown',
        event: item.event,
        excerpt: item.text || '',
        source: item.sourceDocumentId ? `Doc (Page ${item.pageNumber || '?'})` : 'Analysis',
      });
    }
  }

  // Hearing timeline
  if (hearings && hearings.length > 0) {
    for (const hearing of hearings) {
      const dateStr = hearing.hearingDate
        ? new Date(hearing.hearingDate).toLocaleDateString('en-IN')
        : 'Unknown';
      timelineItems.push({
        date: dateStr,
        event: `Hearing #${hearing.hearingNumber}: ${hearing.hearingType} — ${hearing.status}`,
        excerpt: hearing.summary || hearing.outcome || hearing.notes || '',
        source: 'Hearing Record',
      });
    }
  }

  if (timelineItems.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No timeline events available.');
    doc.moveDown(1);
    return;
  }

  // Sort by date (simple string sort works for most date formats)
  timelineItems.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Table header
  const tableTop = doc.y;
  const colWidths = [80, 180, 180, 80];
  const colX = [50, 130, 310, 490];

  doc.font(FONTS.bold).fontSize(8);
  doc.fill(COLORS.background);
  doc.rect(50, tableTop - 5, doc.page.width - 100, 18).fill(COLORS.background);
  doc.fill(COLORS.primary);
  doc.text('Date', colX[0], tableTop, { width: colWidths[0] });
  doc.text('Event', colX[1], tableTop, { width: colWidths[1] });
  doc.text('Evidentiary Excerpt', colX[2], tableTop, { width: colWidths[2] });
  doc.text('Source', colX[3], tableTop, { width: colWidths[3] });

  doc.moveTo(50, tableTop + 12).lineTo(doc.page.width - 50, tableTop + 12).strokeColor(COLORS.border).stroke();

  let y = tableTop + 18;
  doc.font(FONTS.normal).fontSize(8).fill(COLORS.primary);

  for (const item of timelineItems) {
    // Check for page break
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = 50;
    }

    doc.text(truncate(item.date, 20), colX[0], y, { width: colWidths[0], lineBreak: false });
    doc.text(truncate(item.event, 50), colX[1], y, { width: colWidths[1], lineBreak: false });
    doc.text(truncate(item.excerpt, 50), colX[2], y, { width: colWidths[2], lineBreak: false });
    doc.text(truncate(item.source, 20), colX[3], y, { width: colWidths[3], lineBreak: false });

    y += 16;
    doc.moveTo(50, y - 4).lineTo(doc.page.width - 50, y - 4).strokeColor(COLORS.border).stroke();
  }

  doc.moveDown(2);
}

function renderEntities(doc, caseDoc, analysis) {
  addSectionHeader(doc, 'SECTION 3: EXTRACTED LEGAL ENTITIES');

  // Petitioners / Respondents from parties
  if (caseDoc.parties && caseDoc.parties.length > 0) {
    doc.font(FONTS.bold).fontSize(10).text('Case Parties');
    doc.moveDown(0.5);
    doc.font(FONTS.normal).fontSize(9);
    for (const party of caseDoc.parties) {
      doc.text(`  • ${party.name} — ${party.role} (${party.entityType || 'person'})`, { lineGap: 2 });
      if (party.contact) doc.text(`    Contact: ${party.contact}`, { lineGap: 2 });
    }
    doc.moveDown(1);
  }

  // Entities from analysis
  if (analysis?.entities && analysis.entities.length > 0) {
    const grouped = {};
    for (const entity of analysis.entities) {
      const type = entity.type || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(entity);
    }

    for (const [type, entities] of Object.entries(grouped)) {
      doc.font(FONTS.bold).fontSize(10).text(type.charAt(0).toUpperCase() + type.slice(1) + 's');
      doc.moveDown(0.5);
      doc.font(FONTS.normal).fontSize(9);
      for (const entity of entities) {
        doc.text(`  • ${entity.name} (mentions: ${entity.mentions || 1})`, { lineGap: 2 });
      }
      doc.moveDown(1);
    }
  } else {
    doc.font(FONTS.italic).fontSize(9).text('No extracted entities available. Run AI Analysis to extract entities.');
    doc.moveDown(1);
  }
}

function renderStatutoryProvisions(doc, analysis) {
  addSectionHeader(doc, 'SECTION 4: STATUTORY PROVISIONS & PENAL MAPPING');

  if (!analysis?.laws || analysis.laws.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No statutory provisions identified. Run AI Analysis to map applicable laws.');
    doc.moveDown(1);
    return;
  }

  // Table
  const tableTop = doc.y;
  const colX = [50, 110, 180, 300, 420];
  const colWidths = [60, 70, 120, 120, 100];

  doc.font(FONTS.bold).fontSize(8).fill(COLORS.primary);
  doc.rect(50, tableTop - 5, doc.page.width - 100, 18).fill(COLORS.background);
  doc.fill(COLORS.primary);
  doc.text('Code', colX[0], tableTop, { width: colWidths[0] });
  doc.text('Section', colX[1], tableTop, { width: colWidths[1] });
  doc.text('Label', colX[2], tableTop, { width: colWidths[2] });
  doc.text('Description', colX[3], tableTop, { width: colWidths[3] });
  doc.text('Equivalent', colX[4], tableTop, { width: colWidths[4] });

  doc.moveTo(50, tableTop + 12).lineTo(doc.page.width - 50, tableTop + 12).strokeColor(COLORS.border).stroke();

  let y = tableTop + 18;
  doc.font(FONTS.normal).fontSize(8);

  for (const law of analysis.laws) {
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = 50;
    }

    doc.text(truncate(law.code, 15), colX[0], y, { width: colWidths[0], lineBreak: false });
    doc.text(truncate(law.section, 15), colX[1], y, { width: colWidths[1], lineBreak: false });
    doc.text(truncate(law.label, 30), colX[2], y, { width: colWidths[2], lineBreak: false });
    doc.text(truncate(law.description, 30), colX[3], y, { width: colWidths[3], lineBreak: false });
    doc.text(truncate(law.equivalent || '—', 25), colX[4], y, { width: colWidths[4], lineBreak: false });

    y += 16;
    doc.moveTo(50, y - 4).lineTo(doc.page.width - 50, y - 4).strokeColor(COLORS.border).stroke();
  }

  doc.moveDown(2);
}

function renderPrecedents(doc, analysis) {
  addSectionHeader(doc, 'SECTION 5: JUDICIAL PRECEDENTS & AUTHORITIES RELIED UPON');

  if (!analysis?.laws || analysis.laws.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No precedents identified. Run AI Analysis to identify relevant precedents.');
    doc.moveDown(1);
    return;
  }

  // Use laws with relevance as precedent references
  const precedents = analysis.laws.filter((l) => l.relevance);

  if (precedents.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No specific precedent relevance data available.');
    doc.moveDown(1);
    return;
  }

  doc.font(FONTS.normal).fontSize(9);
  for (const law of precedents) {
    doc.font(FONTS.bold).text(`${law.code} Section ${law.section} — ${law.label}`);
    if (law.equivalent) {
      doc.font(FONTS.italic).fontSize(8).text(`  Modern Equivalent: ${law.equivalent}`);
    }
    doc.font(FONTS.normal).fontSize(9).text(`  Relevance: ${law.relevance}`, { lineGap: 3 });
    doc.moveDown(0.5);
  }

  doc.moveDown(1);
}

function renderArguments(doc, argumentsData) {
  addSectionHeader(doc, 'SECTION 6: ADVERSARIAL LEGAL ARGUMENTS');

  if (!argumentsData || argumentsData.status !== 'completed') {
    doc.font(FONTS.italic).fontSize(9).text('No arguments generated yet. Go to the Arguments tab to generate structured arguments.');
    doc.moveDown(1);
    return;
  }

  const petitioner = argumentsData.arguments?.petitioner || [];
  const respondent = argumentsData.arguments?.respondent || [];

  // Petitioner grounds
  doc.font(FONTS.bold).fontSize(12).text('Grounds for Petitioner / Prosecution');
  doc.moveDown(0.5);

  if (petitioner.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No petitioner grounds generated.');
  } else {
    for (let i = 0; i < petitioner.length; i++) {
      const ground = petitioner[i];
      doc.font(FONTS.bold).fontSize(10).text(`${i + 1}. ${ground.title || 'Ground'}`);
      doc.moveDown(0.3);
      if (ground.legalGround) {
        doc.font(FONTS.normal).fontSize(9).text(`   Legal Ground: ${ground.legalGround}`, { lineGap: 3 });
      }
      if (ground.proceduralViolations?.length > 0) {
        doc.font(FONTS.normal).fontSize(9).text('   Procedural Violations:');
        for (const v of ground.proceduralViolations) {
          doc.text(`     • ${v}`, { lineGap: 2 });
        }
      }
      if (ground.citations?.length > 0) {
        doc.font(FONTS.italic).fontSize(8).text(`   Citations: ${ground.citations.join(', ')}`);
      }
      doc.moveDown(0.5);
    }
  }

  doc.moveDown(1);

  // Respondent rebuttals
  doc.font(FONTS.bold).fontSize(12).text('Rebuttals & Submissions for Respondent / Defense');
  doc.moveDown(0.5);

  if (respondent.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No respondent rebuttals generated.');
  } else {
    for (let i = 0; i < respondent.length; i++) {
      const rebuttal = respondent[i];
      doc.font(FONTS.bold).fontSize(10).text(`${i + 1}. ${rebuttal.title || 'Rebuttal'}`);
      doc.moveDown(0.3);
      if (rebuttal.defenseStrategy) {
        doc.font(FONTS.normal).fontSize(9).text(`   Defense Strategy: ${rebuttal.defenseStrategy}`, { lineGap: 3 });
      }
      if (rebuttal.counterArguments?.length > 0) {
        doc.font(FONTS.normal).fontSize(9).text('   Counter-Arguments:');
        for (const c of rebuttal.counterArguments) {
          doc.text(`     • ${c}`, { lineGap: 2 });
        }
      }
      if (rebuttal.mitigatingFactors?.length > 0) {
        doc.font(FONTS.normal).fontSize(9).text('   Mitigating Factors:');
        for (const m of rebuttal.mitigatingFactors) {
          doc.text(`     • ${m}`, { lineGap: 2 });
        }
      }
      doc.moveDown(0.5);
    }
  }

  doc.moveDown(1);
}

function renderEvidenceScorecard(doc, argumentsData, documents) {
  addSectionHeader(doc, 'SECTION 7: EVIDENCE STRENGTH & ADMISSIBILITY ASSESSMENT');

  // Document inventory
  doc.font(FONTS.bold).fontSize(10).text('Document Inventory');
  doc.moveDown(0.5);
  doc.font(FONTS.normal).fontSize(9);

  if (documents && documents.length > 0) {
    for (const docItem of documents) {
      doc.text(`  • ${docItem.originalName} — ${docItem.docType || 'Unknown type'} — ${docItem.pageCount || 0} pages — Status: ${docItem.status}`);
    }
  } else {
    doc.text('  No documents uploaded for this case.');
  }

  doc.moveDown(1);

  // Evidence scores
  if (!argumentsData || argumentsData.status !== 'completed') {
    doc.font(FONTS.italic).fontSize(9).text('No evidence scoring available. Generate arguments to get evidence assessment.');
    doc.moveDown(1);
    return;
  }

  const evidenceScores = argumentsData.evidenceScores || [];
  const metrics = argumentsData.summaryMetrics || {};

  if (evidenceScores.length === 0) {
    doc.font(FONTS.italic).fontSize(9).text('No evidence scores available.');
    doc.moveDown(1);
    return;
  }

  // Summary metrics
  doc.font(FONTS.bold).fontSize(10).text('Evidence Health Summary');
  doc.moveDown(0.5);
  doc.font(FONTS.normal).fontSize(9);
  doc.text(`  Health Score: ${metrics.evidenceHealthScore || 0}%`);
  doc.text(`  Total Grounds: ${metrics.totalGrounds || 0}`);
  doc.text(`  Total Rebuttals: ${metrics.totalRebuttals || 0}`);
  doc.text(`  Documents Scored: ${metrics.evidenceCount || evidenceScores.length}`);
  doc.moveDown(1);

  // Evidence score table
  const tableTop = doc.y;
  const colX = [50, 180, 260, 310, 370];
  const colWidths = [130, 80, 50, 60, 150];

  doc.font(FONTS.bold).fontSize(8).fill(COLORS.primary);
  doc.rect(50, tableTop - 5, doc.page.width - 100, 18).fill(COLORS.background);
  doc.fill(COLORS.primary);
  doc.text('Document', colX[0], tableTop, { width: colWidths[0] });
  doc.text('Type', colX[1], tableTop, { width: colWidths[1] });
  doc.text('Score', colX[2], tableTop, { width: colWidths[2] });
  doc.text('Admissibility', colX[3], tableTop, { width: colWidths[3] });
  doc.text('Classification', colX[4], tableTop, { width: colWidths[4] });

  doc.moveTo(50, tableTop + 12).lineTo(doc.page.width - 50, tableTop + 12).strokeColor(COLORS.border).stroke();

  let y = tableTop + 18;
  doc.font(FONTS.normal).fontSize(8);

  for (const score of evidenceScores) {
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = 50;
    }

    doc.text(truncate(score.documentName, 30), colX[0], y, { width: colWidths[0], lineBreak: false });
    doc.text(truncate(score.docType || '—', 15), colX[1], y, { width: colWidths[1], lineBreak: false });
    doc.text(`${score.score || 0}%`, colX[2], y, { width: colWidths[2], lineBreak: false });
    doc.text(score.admissibility || 'Medium', colX[3], y, { width: colWidths[3], lineBreak: false });
    doc.text(score.primaryEvidence ? 'PRIMARY' : 'SECONDARY', colX[4], y, { width: colWidths[4], lineBreak: false });

    y += 16;
    doc.moveTo(50, y - 4).lineTo(doc.page.width - 50, y - 4).strokeColor(COLORS.border).stroke();
  }

  // Justifications
  doc.moveDown(1);
  doc.font(FONTS.bold).fontSize(10).text('Admissibility Justifications');
  doc.moveDown(0.5);
  doc.font(FONTS.normal).fontSize(9);

  for (const score of evidenceScores) {
    if (score.reasoning) {
      doc.font(FONTS.bold).text(`  ${score.documentName}:`, { continued: true });
      doc.font(FONTS.normal).text(` ${score.reasoning}`, { lineGap: 3 });
    }
  }

  doc.moveDown(1);
}

function renderFooter(doc, caseDoc) {
  const pageCount = doc.bufferedPageRange().count;

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    // Disclaimer at bottom
    const disclaimerY = doc.page.height - 60;
    doc.moveTo(50, disclaimerY).lineTo(doc.page.width - 50, disclaimerY).strokeColor(COLORS.border).stroke();

    doc.font(FONTS.italic)
       .fontSize(7)
       .fillColor(COLORS.muted)
       .text(
         'CONFIDENTIAL: This report is generated by LawGPT Legal Intelligence Platform and is intended for authorized use only. '
         + 'It may contain privileged information protected by attorney-client privilege. Unauthorized disclosure is prohibited.',
         50,
         disclaimerY + 5,
         { width: doc.page.width - 100, align: 'center' }
       );

    // Page number
    doc.font(FONTS.normal)
       .fontSize(8)
       .fillColor(COLORS.muted)
       .text(
         `Page ${i + 1} of ${pageCount}`,
         50,
         doc.page.height - 35,
         { width: doc.page.width - 100, align: 'center' }
       );

    // Generation timestamp
    doc.font(FONTS.italic)
       .fontSize(7)
       .text(
         `Generated: ${new Date().toLocaleString('en-IN')} | Case: ${caseDoc.caseNumber}`,
         50,
         doc.page.height - 22,
         { width: doc.page.width - 100, align: 'center' }
       );

    doc.fillColor(COLORS.primary);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function addSectionHeader(doc, title) {
  // Check if we need a new page (less than 150px remaining)
  if (doc.y > doc.page.height - 150) {
    doc.addPage();
  }

  doc.moveDown(1);
  const y = doc.y;

  // Section header with background
  doc.rect(50, y - 5, doc.page.width - 100, 22).fill(COLORS.accent);
  doc.fill(COLORS.white)
     .font(FONTS.bold)
     .fontSize(11)
     .text(title, 60, y, { width: doc.page.width - 120 });

  doc.fill(COLORS.primary);
  doc.moveDown(1.5);
}

function truncate(str, maxLen) {
  if (!str) return '—';
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

module.exports = { generateCaseReport };
