const { randomBytes } = require('node:crypto');
const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');
const passwordService = require('./passwordService');

// Verified against when no account is found, so an unknown address costs the
// same as a wrong password. Identical answers still differ in how long they take.
const ABSENT_ACCOUNT_HASH = passwordService.hashPassword(randomBytes(32).toString('hex'));

const OUTCOMES = {
  AUTHENTICATED: 'authenticated',
  INVALID_CREDENTIALS: 'invalid_credentials',
  APPLICATION_PENDING: 'application_pending',
  APPLICATION_REJECTED: 'application_rejected',
  ACCOUNT_SUSPENDED: 'account_suspended',
};

const APPLICATION_OUTCOMES = {
  [APPLICATION_STATUSES.PENDING_REVIEW]: OUTCOMES.APPLICATION_PENDING,
  [APPLICATION_STATUSES.CHANGES_REQUESTED]: OUTCOMES.APPLICATION_PENDING,
  [APPLICATION_STATUSES.REJECTED]: OUTCOMES.APPLICATION_REJECTED,
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

async function authenticateMember(
  body,
  findMemberByEmail = (email) =>
    Member.findOne({ email }).select('passwordHash applicationStatus accountStatus').lean(),
  verifyPassword = passwordService.verifyPassword,
) {
  const credentials = readCredentials(body);

  if (credentials === null) {
    return { outcome: OUTCOMES.INVALID_CREDENTIALS };
  }

  const member = await findMemberByEmail(credentials.email);
  const storedHash = member ? member.passwordHash : await ABSENT_ACCOUNT_HASH;
  const passwordMatches = await verifyPassword(credentials.password, storedHash);

  // The password is answered first and on its own. Only someone who already
  // proved they own the account is told anything about its state.
  if (!member || !passwordMatches) {
    return { outcome: OUTCOMES.INVALID_CREDENTIALS };
  }

  const applicationOutcome = APPLICATION_OUTCOMES[member.applicationStatus];

  if (applicationOutcome !== undefined) {
    return { outcome: applicationOutcome };
  }

  if (member.accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
    return { outcome: OUTCOMES.ACCOUNT_SUSPENDED };
  }

  return {
    outcome: OUTCOMES.AUTHENTICATED,
    identity: { id: String(member._id), role: ROLES.MEMBER },
  };
}

module.exports = { authenticateMember, readCredentials, OUTCOMES };
