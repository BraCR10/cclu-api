const { randomBytes } = require('node:crypto');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');
const passwordService = require('../services/passwordService');

// Verified against when no account is found, so an unknown address costs the
// same as a wrong password. Identical answers still differ in how long they take.
const ABSENT_ACCOUNT_HASH = passwordService.hashPassword(randomBytes(32).toString('hex'));

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Refused before it can reach the database: { "email": { "$ne": null } } would
// otherwise become a query matching the first account, with no credentials.
function readCredentials(body) {
  if (body === null || typeof body !== 'object') {
    return null;
  }

  const { email, password } = body;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return null;
  }

  return { email: email.trim().toLowerCase(), password };
}

async function authenticateAdmin(
  body,
  findAdminByEmail = (email) =>
    Admin.findOne({ email }).select('passwordHash accountStatus').lean(),
  verifyPassword = passwordService.verifyPassword,
) {
  const credentials = readCredentials(body);

  if (credentials === null) {
    return null;
  }

  const admin = await findAdminByEmail(credentials.email);
  const storedHash = admin ? admin.passwordHash : await ABSENT_ACCOUNT_HASH;
  const passwordMatches = await verifyPassword(credentials.password, storedHash);

  // Missing, wrong and suspended all end here. Separating them would confirm an
  // address is an administrator, or that a password was right.
  if (!admin || !passwordMatches || admin.accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
    return null;
  }

  return { id: String(admin._id), role: ROLES.ADMIN };
}

module.exports = { authenticateAdmin, readCredentials };
