const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const User = require('../models/User');
const env = require('../config/env');
const tokenService = require('../services/tokenService');

/**
 * Issues an access token (returned in the body) and a refresh token
 * (set as an httpOnly cookie), and persists the refresh token's hash on
 * the user document so it can be verified and revoked later.
 */
async function issueSession(res, user, { rememberMe = false } = {}) {
  const accessToken = tokenService.generateAccessToken(user);
  const refreshToken = tokenService.generateRefreshToken(user);

  const refreshMaxAgeMs = rememberMe
    ? tokenService.durationToMs('30d')
    : tokenService.durationToMs(env.jwt.refreshExpiresIn);

  user.refreshTokenHash = tokenService.hashToken(refreshToken);
  user.refreshTokenExpiresAt = new Date(Date.now() + refreshMaxAgeMs);
  await user.save({ validateBeforeSave: false });

  res.cookie(env.jwt.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: refreshMaxAgeMs,
    path: '/api/auth',
  });

  return accessToken;
}

function clearSessionCookie(res) {
  res.clearCookie(env.jwt.refreshCookieName, { path: '/api/auth' });
}

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create({ fullName, email, password, role });
  const accessToken = await issueSession(res, user, { rememberMe: false });

  return new ApiResponse(201, 'Account created successfully', {
    user: user.toSafeJSON(),
    accessToken,
  }).send(res);
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe } = req.body;

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLogin = new Date();
  const accessToken = await issueSession(res, user, { rememberMe: Boolean(rememberMe) });

  return new ApiResponse(200, 'Logged in successfully', {
    user: user.toSafeJSON(),
    accessToken,
  }).send(res);
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.jwt.refreshCookieName];

  if (token) {
    try {
      const payload = tokenService.verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.sub, {
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      });
    } catch {
      // Token already invalid/expired — nothing to revoke, just clear the cookie.
    }
  }

  clearSessionCookie(res);
  return new ApiResponse(200, 'Logged out successfully').send(res);
});

// POST /api/auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.jwt.refreshCookieName];
  if (!token) {
    throw ApiError.unauthorized('No session found');
  }

  let payload;
  try {
    payload = tokenService.verifyRefreshToken(token);
  } catch {
    clearSessionCookie(res);
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  const user = await User.findById(payload.sub).select('+refreshTokenHash +refreshTokenExpiresAt');
  const presentedHash = tokenService.hashToken(token);

  const isValid =
    user &&
    user.refreshTokenHash &&
    user.refreshTokenHash === presentedHash &&
    user.refreshTokenExpiresAt &&
    user.refreshTokenExpiresAt.getTime() > Date.now();

  if (!isValid) {
    // Signature was valid but the hash doesn't match a token we issued —
    // it was already rotated out. Treat as possible token reuse and kill
    // the session rather than silently accepting it.
    if (user) {
      user.refreshTokenHash = null;
      user.refreshTokenExpiresAt = null;
      await user.save({ validateBeforeSave: false });
    }
    clearSessionCookie(res);
    throw ApiError.unauthorized('Session is no longer valid, please log in again');
  }

  // Rotate: issue a brand new refresh token and invalidate this one.
  const accessToken = await issueSession(res, user, { rememberMe: false });

  return new ApiResponse(200, 'Session refreshed', {
    user: user.toSafeJSON(),
    accessToken,
  }).send(res);
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  return new ApiResponse(200, 'Current user', { user: req.user.toSafeJSON() }).send(res);
});

module.exports = { register, login, logout, refresh, me };
