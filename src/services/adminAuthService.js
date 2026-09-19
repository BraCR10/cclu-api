const { randomBytes } = require('node:crypto');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');
const passwordService = require('../services/passwordService');

// Verified against when no account was found, so that an unknown address costs
// the same as a known one with the wrong password. Without it the answer is
// identical but the wait is not, and the wait is enough to map which addresses
// are accounts.
const ABSENT_ACCOUNT_HASH = passwordService.hashPassword(randomBytes(32).toString('hex'));

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Anything that is not a string is refused before it can reach the database. A
// body carrying { "email": { "$ne": null } } would otherwise become a query
// matching the first account in the collection, with no credentials at all.
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

  // A missing account, a wrong password and a suspended account all end here.
  // Separating them would confirm that an address is an administrator, or that
  // a password was right, which is the half an attacker is missing.
  if (!admin || !passwordMatches || admin.accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
    return null;
  }

  return { id: String(admin._id), role: ROLES.ADMIN };
}

module.exports = { authenticateAdmin, readCredentials };
