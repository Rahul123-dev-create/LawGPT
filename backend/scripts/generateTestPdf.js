/**
 * generateTestPdf.js — Generates a clean, text-extractable legal PDF fixture
 * for E2E testing.
 *
 * The earlier E2E run used a hand-crafted minimal PDF with no actual text
 * stream, so python-ai extraction marked the document "failed" ("No text
 * could be extracted from this document") and every downstream feature
 * (AI analysis, arguments, chat) returned 400 "no processed documents".
 *
 * This fixture is a realistic, multi-page Writ Petition with real embedded
 * text (via pdfkit), so PyMuPDF extraction always produces usable page text
 * and the whole Module 4 -> 5 -> 7 -> 8 -> 9 chain can be exercised.
 *
 * Usage:  node scripts/generateTestPdf.js [outputPath]
 *   Default output: <repo>/frontend/scripts/fixtures/LawGPT-E2E-Writ-Petition.pdf
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '..', 'frontend', 'scripts', 'fixtures');
const OUT_FILE = process.argv[2] || path.join(OUT_DIR, 'LawGPT-E2E-Writ-Petition.pdf');

// ─── Content ─────────────────────────────────────────────────────────────
// Paragraphs drawn on the current page; a new page starts when the cursor
// gets near the bottom. Content deliberately repeats the Section 27A ground
// and key entities across pages so analysis, arguments, and chat all find
// real text to ground on, with page provenance.
const TITLE = 'IN THE HIGH COURT OF KARNATAKA AT BENGALURU';
const SUBTITLE = 'WRIT PETITION No. 2026/04';
const PARTIES = [
  'BETWEEN:',
  'Karepura Agricultural & Rural Co-operative Society (Regd.),',
  'represented by its duly elected Past Managing Committee Member,',
  'Sri. G. Ramesh, S/o. Late Shankarappa, R/a: Karepura Village,',
  'Channapatna Taluk, Ramanagara District - 562 160.  ... PETITIONER',
  '',
  'AND:',
  'The Registrar of Societies, Government of Karnataka,',
  'Dr. B.R. Ambedkar Bhavan, Bengaluru - 560 001.  ... RESPONDENT 1',
  '',
  'The Returning Officer, Karepura Agricultural & Rural Co-operative',
  'Society, Karepura Village, Ramanagara District - 562 160.  ... RESPONDENT 2',
  '',
  'PRAYER:',
  'In view of the facts and circumstances stated in the accompanying',
  'affidavit, the Petitioner most humbly prays that this Honble Court may',
  'be pleased to issue a writ of certiorari and a writ of mandamus:',
  '(a) quashing the Notice dated 04/01/2026 issued by Respondent 2',
  '    postponing the elections of the Managing Committee; and',
  '(b) directing Respondent 1 to supervise and complete the democratic',
  '    elections of the Managing Committee within four weeks.',
  'AND the Petitioner as in duty bound will ever pray.',
  '',
];

const BODY = [
  '1. The Petitioner is a member of the Karepura Agricultural & Rural Co-operative Society (Regd.) ("the Society"), a society registered under the Karnataka Societies Registration Act, 1960, and governed by its own bye-laws as amended from time to time.',
  '2. The Society has 1,240 members. Under bye-law 43, an annual general body meeting must be held within six months of the close of every financial year, and the Managing Committee of 11 members must be elected by secret ballot once every three years.',
  '3. The last valid election of the Managing Committee was held on 12/06/2023. The term of the said Managing Committee expired on 11/06/2026. No extension was recorded in the minutes of any general body meeting, and no resolution of the general body authorized the outgoing committee to continue beyond its term.',
  '4. On 18/11/2025, the Petitioner submitted a written requisition under bye-law 45 signed by 210 members demanding that the General Secretary convene an urgent general body meeting to appoint an election officer and schedule the triennial elections before 30/04/2026.',
  '5. The General Secretary neither convened the meeting nor replied. The Petitioner therefore addressed a representation dated 02/12/2025 to Respondent 1, the Registrar of Societies, invoking Section 27A of the Karnataka Societies Registration Act, 1960, which empowers the Registrar to order the conduct of the affairs of a society, including the holding of elections of the managing committee.',
  '6. Respondent 1, by endorsement dated 20/12/2025, forwarded the representation to Respondent 2, the Returning Officer, with a request to hold the elections expeditiously in terms of Section 27A and the Karnataka Societies (Election) Rules, 2018.',
  '7. Respondent 2 issued an election calendar on 02/01/2026 fixing the poll for 25/01/2026 and publishing the final voters list of 1,182 eligible members under Rule 7 of the Societies (Election) Rules, 2018.',
  '8. Five days before the poll, on 04/01/2026, Respondent 2 issued the impugned Notice deferring the elections indefinitely on the purported ground of "administrative exigencies arising out of pending audit objections", without recording any supporting material and without the prior written approval of Respondent 1.',
  '9. No audit objection was ever communicated to the members, and the notice of deferment was never served on the general body. The outgoing Managing Committee continues to exercise custody of the funds, books, and records of the Society after the expiry of its lawful term, contrary to bye-law 43 and the mandatory scheme of Section 27A of the Karnataka Societies Registration Act, 1960.',
  '10. The Petitioner has no other equally efficacious remedy: specific enforcement of the statutory duty to hold elections lies only before this Honble Court in its writ jurisdiction under Article 226 of the Constitution of India.',
  '11. Pending the election, the Society continues to suffer prejudice: no new members are admitted, no annual accounts are laid before the general body, and the register of members has fallen into arrears.',
  '12. In these circumstances, the writ of mandamus sought herein is the only complete and effective remedy, and unless the election is directed to be completed, the democratic character of the Society will be lost and the rights of the members under the Act will stand defeated.',
];
// ─── Build the PDF ───────────────────────────────────────────────────────
function build() {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });
    const stream = fs.createWriteStream(OUT_FILE);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    // Title block
    doc.font('Helvetica-Bold').fontSize(14).text(TITLE, { align: 'center' });
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).text(SUBTITLE, { align: 'center' });
    doc.moveDown(1.2);

    // Parties + prayer
    doc.font('Helvetica').fontSize(11);
    for (const line of PARTIES) {
      doc.text(line);
      doc.moveDown(0.15);
    }

    doc.moveDown(0.5);
    doc.text('TO,');
    doc.text('The Honble Chief Justice and other companion Judges of the');
    doc.text('High Court of Karnataka at Bengaluru.');
    doc.moveDown(1);

    // Body — add a new page whenever the cursor nears the bottom margin.
    doc.font('Helvetica').fontSize(11);
    for (const para of BODY) {
      doc.text(para, { lineGap: 0.25 });
      doc.moveDown(0.4);
      if (doc.y + 60 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(
      'Filed under the Karnataka Societies Registration Act, 1960 and the Karnataka Societies (Election) Rules, 2018.',
      { align: 'center' }
    );

    doc.end();
  });
}

build()
  .then(() => {
    const bytes = fs.statSync(OUT_FILE).size;
    console.log(`Wrote ${OUT_FILE} (${bytes} bytes)`);
  })
  .catch((err) => {
    console.error('Failed to generate test PDF:', err);
    process.exit(1);
  });