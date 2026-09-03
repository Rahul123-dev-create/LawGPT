const mongoose = require('mongoose');

/**
 * Module 8 — Case Chat Message model.
 *
 * Stores the conversation history between users and the AI assistant
 * for a specific case. Each message records its role, content, and
 * any document citations the assistant referenced.
 */

const MESSAGE_ROLES = ['user', 'assistant', 'system'];

const citationSchema = new mongoose.Schema(
  {
    documentName: { type: String, default: '' },
    pageNumber: { type: Number, default: 0 },
    snippet: { type: String, default: '' },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const caseChatMessageSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: MESSAGE_ROLES,
      required: [true, 'Message role is required'],
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
    },
    citations: [citationSchema],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for efficient retrieval of chat history per case, ordered by time
caseChatMessageSchema.index({ caseId: 1, createdAt: 1 });

const CaseChatMessage = mongoose.model('CaseChatMessage', caseChatMessageSchema);

module.exports = CaseChatMessage;
module.exports.MESSAGE_ROLES = MESSAGE_ROLES;
