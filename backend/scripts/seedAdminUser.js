/**
 * seedAdminUser.js — Creates a verified admin user for E2E testing.
 *
 * Usage:  node scripts/seedAdminUser.js
 *
 * Checks if a user with email admin@lawgpt.local already exists.
 * If not, creates one with the specified credentials.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lawgpt';

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

const ADMIN_USER = {
  fullName: 'Senior Advocate',
  email: 'admin@lawgpt.local',
  password: 'Password@123',
  role: 'admin',
  isVerified: true,
};

async function seed() {
  console.log(`Connecting to MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const existing = await User.findOne({ email: ADMIN_USER.email });
  if (existing) {
    console.log(`Admin user already exists: ${ADMIN_USER.email} (id: ${existing._id})`);
    console.log('Updating role and verified status to ensure admin access...');
    existing.role = ADMIN_USER.role;
    existing.isVerified = ADMIN_USER.isVerified;
    existing.fullName = ADMIN_USER.fullName;
    await existing.save({ validateBeforeSave: false });
    console.log('Admin user profile updated successfully.');
  } else {
    const user = await User.create(ADMIN_USER);
    console.log(`Created admin user: ${ADMIN_USER.email} (id: ${user._id})`);
    console.log(`  Name:     ${ADMIN_USER.fullName}`);
    console.log(`  Role:     ${ADMIN_USER.role}`);
    console.log(`  Verified: ${ADMIN_USER.isVerified}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
  console.log('');
  console.log('Test Credentials:');
  console.log(`  Login URL: http://localhost:5173/login`);
  console.log(`  Email:     ${ADMIN_USER.email}`);
  console.log(`  Password:  ${ADMIN_USER.password}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
