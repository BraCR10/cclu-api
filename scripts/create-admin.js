require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Admin } = require('../src/models/Admin');
const { hashPassword } = require('../src/services/passwordService');
const { readPassword } = require('../src/config/memberRules');

// The panel has no way to sign up, so there has to be a way in before anyone is
// in. This is it.

function readEmail() {
  const email = process.argv[2];

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Usage: ADMIN_PASSWORD=<password> npm run create-admin -- <email>');
  }

  return email.trim().toLowerCase();
}

async function createAdmin() {
  const email = readEmail();
  // Read from the environment and never printed. Anything shown lands in
  // scrollback and in whatever collects this process's output.
  const password = readPassword({ ADMIN_PASSWORD: process.env.ADMIN_PASSWORD }, 'ADMIN_PASSWORD');

  await connectDatabase();

  // The unique index is what actually prevents a duplicate; this only turns a
  // race into a message an operator can read.
  const admin = await Admin.create({ email, passwordHash: await hashPassword(password) });

  console.log(`Administrator created: ${email} (${admin._id})`);
}

createAdmin()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    const alreadyExists = error.code === 11000;

    console.error(
      alreadyExists ? 'An administrator already exists for that address.' : error.message,
    );
    await mongoose.disconnect();
    process.exit(1);
  });
