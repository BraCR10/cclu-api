require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Admin } = require('../src/models/Admin');
const { hashPassword } = require('../src/services/passwordService');

// The panel has no way to sign up, so there has to be a way in before anyone is
// in. This is it.

const MINIMUM_PASSWORD_LENGTH = 12;

function readEmail() {
  const email = process.argv[2];

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Usage: ADMIN_PASSWORD=<password> npm run create-admin -- <email>');
  }

  return email.trim().toLowerCase();
}

// Read from the environment and never printed. Anything shown lands in
// scrollback and in whatever collects this process's output.
function readPassword() {
  const password = process.env.ADMIN_PASSWORD;

  if (typeof password !== 'string' || password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(
      `Set ADMIN_PASSWORD to at least ${MINIMUM_PASSWORD_LENGTH} characters before running this.`,
    );
  }

  return password;
}

async function createAdmin() {
  const email = readEmail();
  const password = readPassword();

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
