const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const CaseChatMessage = require('../models/CaseChatMessage');
const { sendChatMessage } = require('../services/chatService');

/**
 * Module 8 — Case Chat controller.
 *
 * Manages the conversation between users and the AI assistant for a case.
 * Messages are persisted to MongoDB so conversation history survives page
 * refreshes and can be reviewed later.
 */

// POST /api/cases/:caseId/chat
const sendCaseMessage = asyncHandler(async (req, res) => {
  const caseDoc = req.case;
  const { content } = req.body;

  if (!content || !content.trim()) {
    throw ApiError.badRequest('Message content is required');
  }

  // 1. Save the user message
  const userMessage = await CaseChatMessage.create({
    caseId: caseDoc._id,
    userId: req.user._id,
    role: 'user',
    content: content.trim(),
  });

  // 2. Retrieve last 10 messages for conversation history
  const recentMessages = await CaseChatMessage.find({ caseId: caseDoc._id })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('role content createdAt')
    .lean();

  // Reverse to chronological order and format for the AI service
  const history = recentMessages.reverse().map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // 3. Call python-ai chat service
  let assistantData;
  try {
    assistantData = await sendChatMessage({
      caseId: caseDoc._id.toString(),
      query: content.trim(),
      history: history.slice(0, -1), // Exclude the current user message from history
      topK: 6,
    });
  } catch (err) {
    // Still save the failed assistant response so the user sees something
    const errorMessage = err.message || 'I apologize, but I encountered an error processing your request. Please try again.';
    const assistantMessage = await CaseChatMessage.create({
      caseId: caseDoc._id,
      userId: req.user._id,
      role: 'assistant',
      content: errorMessage,
      citations: [],
    });

    return new ApiResponse(200, 'Message sent (with error response)', {
      userMessage,
      assistantMessage,
    }).send(res);
  }

  // 4. Save the assistant's reply with citations
  const assistantMessage = await CaseChatMessage.create({
    caseId: caseDoc._id,
    userId: req.user._id,
    role: 'assistant',
    content: assistantData.answer || 'I could not generate a response.',
    citations: (assistantData.citations || []).map((c) => ({
      documentName: c.document_name || '',
      pageNumber: c.page_number || 0,
      snippet: c.snippet || '',
      score: c.score || 0,
    })),
  });

  return new ApiResponse(200, 'Message sent', {
    userMessage,
    assistantMessage,
  }).send(res);
});

// GET /api/cases/:caseId/chat
const getCaseChatHistory = asyncHandler(async (req, res) => {
  const messages = await CaseChatMessage.find({ caseId: req.case._id })
    .sort({ createdAt: 1 })
    .select('role content citations createdAt')
    .lean();

  return new ApiResponse(200, 'Chat history retrieved', { messages }).send(res);
});

// DELETE /api/cases/:caseId/chat
const clearCaseChatHistory = asyncHandler(async (req, res) => {
  await CaseChatMessage.deleteMany({ caseId: req.case._id });

  return new ApiResponse(200, 'Chat history cleared').send(res);
});

module.exports = {
  sendCaseMessage,
  getCaseChatHistory,
  clearCaseChatHistory,
};
