const axios = require('axios');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Module 8 — calls python-ai's stateless chat service.
 *
 * Sends the user query along with conversation history to the AI service,
 * which retrieves relevant document chunks and generates a grounded response
 * with citations.
 */

const CHAT_CALL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per chat call

/** Is this a network-level failure (python-ai unreachable) rather than a
 * pipeline/HTTP error response? Connection failures surface as clean 502s. */
function isConnectionError(err) {
  if (err.response) return false;
  return Boolean(
    err.request ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNRESET' ||
    err.code === 'ETIMEDOUT'
  );
}

/** Best-effort human-readable error from a failed python-ai call. */
function extractError(err) {
  const raw =
    err.response?.data?.error ??
    err.response?.data?.detail ??
    err.response?.data?.message ??
    err.message;
  if (typeof raw === 'string') return raw.slice(0, 2000);
  try {
    return JSON.stringify(raw).slice(0, 2000);
  } catch (_e) {
    return String(raw).slice(0, 2000);
  }
}

/** Calls python-ai POST /chat/case and returns the structured result. */
async function sendChatMessage({ caseId, query, history, topK = 6 }) {
  let response;
  try {
    response = await axios.post(
      `${env.pythonAiServiceUrl}/chat/case`,
      {
        case_id: caseId,
        query,
        history: history || [],
        top_k: topK,
      },
      {
        timeout: CHAT_CALL_TIMEOUT_MS,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );
  } catch (err) {
    if (isConnectionError(err)) {
      logger.warn(`python-ai unreachable for chat (case ${caseId}): ${err.code || err.message}`);
      throw ApiError.badGateway('AI service unreachable — chat failed');
    }
    const detail = extractError(err);
    logger.warn(`Chat failed (case ${caseId}): ${detail}`);
    throw ApiError.unprocessable(detail || 'Chat generation failed');
  }

  const data = response.data?.data ?? response.data;
  if (!data || typeof data !== 'object') {
    throw ApiError.unprocessable('Chat returned an empty result');
  }
  return data;
}

module.exports = { sendChatMessage, CHAT_CALL_TIMEOUT_MS };
