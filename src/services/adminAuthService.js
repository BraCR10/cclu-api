const { randomBytes } = require('node:crypto');
const { Admin } = require('../models/Admin');
const { ADMIN_ACCOUNT_STATUSES, effectiveAdminState } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');
const passwordService = require('../services/passwordService');

// Verified against when no account is found, so an unknown address costs the
// same as a wrong password. Identical answers still differ in how long they take.
const ABSENT_ACCOUNT_HASH = passwordService.hashPassword(randomBytes(32).toString('hex'));

const OUTCOMES = {
  AUTHENTICATED: 'authenticated',
  INVALID_CREDENTIALS: 'invalid_credentials',
  INVITATION_PENDING: 'invitation_pending',
  INVITATION_EXPIRED: 'invitation_expired',
  ACCOUNT_INACTIVE: 'account_inactive',
};

// The states an administrator can be refused for, and the code each one answers
// with. A code is what the screen decides on, and each says what to do next.
const REFUSALS_BY_STATE = {
  [ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING]: OUTCOMES.INVITATION_PENDING,
  [ADMIN_ACCOUNT_STATUSES.INVITATION_EXPIRED]: OUTCOMES.INVITATION_EXPIRED,
  [ADMIN_ACCOUNT_STATUSES.INACTIVE]: OUTCOMES.ACCOUNT_INACTIVE,
};

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
    Admin.findOne({ email }).select('passwordHash accountStatus invitationExpiresAt').lean(),
  verifyPassword = passwordService.verifyPassword,
) {
  const credentials = readCredentials(body);

  if (credentials === null) {
    return { outcome: OUTCOMES.INVALID_CREDENTIALS };
  }

  const admin = await findAdminByEmail(credentials.email);
  const storedHash = admin ? admin.passwordHash : await ABSENT_ACCOUNT_HASH;
  const passwordMatches = await verifyPassword(credentials.password, storedHash);

  // The password is answered first and alone. Until it is right, nothing about
  // the account is confirmed, not even that it exists: an unknown address, a
  // wrong password and an inactive panel all answer the same.
  if (!admin || !passwordMatches) {
    return { outcome: OUTCOMES.INVALID_CREDENTIALS };
  }

  // Only now, with the password proved, does the state get to say which refusal
  // it is. It is what tells an invited administrator to look in their inbox.
  const state = effectiveAdminState(admin);

  if (state !== ADMIN_ACCOUNT_STATUSES.ACTIVE) {
    return { outcome: REFUSALS_BY_STATE[state] ?? OUTCOMES.ACCOUNT_INACTIVE };
  }

  return {
    outcome: OUTCOMES.AUTHENTICATED,
    identity: { id: String(admin._id), role: ROLES.ADMIN },
  };
}

module.exports = { authenticateAdmin, readCredentials, OUTCOMES };
