/**
 * seedTestUser.js — Creates a verified test user for E2E testing.
 *
 * Usage:  node scripts/seedTestUser.js
 *
 * Checks if a user with email test@lawgpt.local already exists.
 * If not, creates one with the specified credentials.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lawgpt';

// Inline User schema (avoid require path issues with module resolution)
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'lawyer', 'researcher', 'student'], default: 'student' },
    avatar: { type: String, default: '' },
    isVerified: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },
    refreshTokenHash: { type: String, select: false, default: null },
    refreshTokenExpiresAt: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model('User', userSchema);

const TEST_USER = {
  fullName: 'Lead Counsel',
  email: 'test@lawgpt.local',
  password: 'Password@123',
  role: 'admin',
  isVerified: true,
};

async function seed() {
  console.log(`Connecting to MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const existing = await User.findOne({ email: TEST_USER.email });
  if (existing) {
    console.log(`Test user already exists: ${TEST_USER.email} (id: ${existing._id})`);
    console.log('No action needed.');
  } else {
    const user = await User.create(TEST_USER);
    console.log(`Created test user: ${TEST_USER.email} (id: ${user._id})`);
    console.log(`  Name:  ${TEST_USER.fullName}`);
    console.log(`  Role:  ${TEST_USER.role}`);
    console.log(`  Verified: ${TEST_USER.isVerified}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
