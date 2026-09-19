require('dotenv').config();

const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const connectDatabase = require('../src/config/database');
const { Admin } = require('../src/models/Admin');
const { hashPassword } = require('../src/services/passwordService');

// The first administrators are created here rather than by signing up, which
// assumption 12 of the requirements states plainly: the system has no self
// registration for the panel, so there has to be a way in before anyone is in.

function readEmail() {
  const email = process.argv[2];

  if (typeof email !== 'string' || !email.includes('@')) {
    throw new Error('Usage: npm run create-admin -- <email>');
  }

  return email.trim().toLowerCase();
}

// Taken from the environment or generated, never from the command line, where
// it would sit in the shell history and in the process list for anyone to read.
function readPassword() {
  const supplied = process.env.ADMIN_PASSWORD;

  if (typeof supplied === 'string' && supplied.length >= 12) {
    return { password: supplied, generated: false };
  }

  if (typeof supplied === 'string' && supplied.length > 0) {
    throw new Error('ADMIN_PASSWORD is shorter than 12 characters. Use a longer one.');
  }

  return { password: randomBytes(18).toString('base64url'), generated: true };
}

async function createAdmin() {
  const email = readEmail();
  const { password, generated } = readPassword();

  await connectDatabase();

  const existing = await Admin.findOne({ email }).select('_id').lean();

  if (existing !== null) {
    throw new Error(
      `An administrator already exists for ${email}. This script does not replace it.`,
    );
  }

  const admin = await Admin.create({ email, passwordHash: await hashPassword(password) });

  console.log(`Administrator created: ${email} (${admin._id})`);

  if (generated) {
    console.log(`Generated password: ${password}`);
    console.log('It is shown once and stored only as a hash. Save it now.');
  }
}

createAdmin()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
