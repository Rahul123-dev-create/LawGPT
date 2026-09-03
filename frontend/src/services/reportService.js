import api from './api';

/**
 * Module 9 — Report Service.
 *
 * Handles PDF report generation and download requests.
 * The PDF endpoint returns a binary stream (not JSON), so we use
 * responseType: 'blob' and trigger a browser download from the response.
 */

/**
 * Download a comprehensive PDF case report.
 * @param {string} caseId - The case identifier
 * @param {Object} [options] - Report section toggles
 * @param {boolean} [options.includePrecedents=true]
 * @param {boolean} [options.includeArguments=true]
 * @param {boolean} [options.includeEvidenceScorecard=true]
 * @returns {Promise<Blob>} The PDF blob
 */
export async function downloadCasePdfReport(caseId, options = {}) {
  const params = new URLSearchParams();
  if (options.includePrecedents === false) params.set('includePrecedents', 'false');
  if (options.includeArguments === false) params.set('includeArguments', 'false');
  if (options.includeEvidenceScorecard === false) params.set('includeEvidenceScorecard', 'false');

  const queryString = params.toString();
  const url = `/cases/${caseId}/report/pdf${queryString ? `?${queryString}` : ''}`;

  const response = await api.get(url, { responseType: 'blob' });

  // Trigger browser download
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;

  // Extract filename from Content-Disposition header or use default
  const disposition = response.headers['content-disposition'];
  let filename = `LawGPT_Report.pdf`;
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);

  return { filename, size: blob.size };
}

/**
 * Get report metadata (available sections, completeness score).
 * @param {string} caseId
 * @returns {Promise<Object>} Report metadata
 */
export async function getReportMetadata(caseId) {
  const { data } = await api.get(`/cases/${caseId}/report/metadata`);
  return data.data;
}
