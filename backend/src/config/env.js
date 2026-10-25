const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

const required = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

function requireInProduction() {
  if (process.env.NODE_ENV === 'production') {
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) {
      // Fail fast rather than booting with an insecure/undefined secret.
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}

requireInProduction();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/lawgpt',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  pythonAiServiceUrl: process.env.PYTHON_AI_SERVICE_URL || 'http://localhost:8000',
  // Root directory for uploaded case documents (Module 4). Defaults to
  // <repo>/backend/uploads. Gitignored — uploaded files are never committed.
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'),

  // Module 4 Phase 2 — document processing pipeline worker. The backend polls
  // MongoDB for documents stuck in 'pending' and hands each to the python-ai
  // service (extraction/OCR/chunking/embeddings). pollIntervalMs is the
  // sleep between poll ticks; processingTimeoutMs is how old an in-flight
  // 'processing' record must be before it is treated as a crashed job and
  // requeued on the next tick.
  docPipeline: {
    pollIntervalMs: parseInt(process.env.DOC_PIPELINE_POLL_INTERVAL_MS, 10) || 5000,
    processingTimeoutMs: parseInt(process.env.DOC_PROCESSING_TIMEOUT_MS, 10) || 10 * 60 * 1000,
  },

  // Module 5 Phase 3 — case analysis. maxChars caps the total document text
  // streamed to python-ai for one analysis (whole pages are dropped from the
  // end past this budget, never cut mid-page), keeping LLM context bounded.
  analysis: {
    maxChars: parseInt(process.env.ANALYSIS_MAX_CHARS, 10) || 30000,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    refreshCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME || 'lawgpt_refresh_token',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 10,
  },
};

module.exports = env;
