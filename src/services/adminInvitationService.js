const { Admin } = require('../models/Admin');
const { ADMIN_ACCOUNT_STATUSES, effectiveAdminState } = require('../config/accountStatus');
const { ERROR_CODES } = require('../config/errorCodes');
const { readPassword, ValidationError } = require('../config/memberRules');
const passwordService = require('./passwordService');
const { digestOf } = require('./adminDirectoryService');

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

// A link that is not a link, or one that no longer names an invitation, answer
// the same: there is nothing to tell apart from the outside.
function notValid(message) {
  return new ValidationError(ERROR_CODES.INVALID_CODE, 'token', message, 404);
}

function readToken(value) {
  if (typeof value !== 'string' || !TOKEN_SHAPE.test(value.trim())) {
    throw notValid('The link is not valid.');
  }

  return value.trim();
}

const defaultStore = {
  findByToken: (tokenHash) =>
    Admin.findOne({ invitationTokenHash: tokenHash })
      .select('name email accountStatus invitationExpiresAt invitationTokenHash')
      .lean(),
  update: (adminId, changes) =>
    Admin.updateOne({ _id: adminId }, { $set: changes }, { returnDocument: 'after' }),
};

// The form shows the address fixed, so it has to know it before the password is
// chosen, and the day the link stops working, so the sentence under the button
// names a real date. It answers only while the invitation is still pending.
async function readInvitation(token, now = new Date(), store = defaultStore) {
  const raw = readToken(token);
  const admin = await store.findByToken(digestOf(raw));

  if (
    admin === null ||
    admin === undefined ||
    effectiveAdminState(admin, now) !== ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING
  ) {
    throw notValid('The invitation is not valid or has expired.');
  }

  return {
    name: admin.name ?? null,
    email: admin.email,
    expiresAt: admin.invitationExpiresAt ?? null,
  };
}

// Accepting sets the password and opens the panel, and the token stops working
// in the same write: an invitation is used once.
async function acceptInvitation(token, body, now = new Date(), store = defaultStore) {
  const raw = readToken(token);
  const admin = await store.findByToken(digestOf(raw));

  if (
    admin === null ||
    admin === undefined ||
    effectiveAdminState(admin, now) !== ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING
  ) {
    throw notValid('The invitation is not valid or has expired.');
  }

  const passwordHash = await passwordService.hashPassword(readPassword(body));

  await store.update(admin._id, {
    passwordHash,
    accountStatus: ADMIN_ACCOUNT_STATUSES.ACTIVE,
    invitationTokenHash: null,
    invitationExpiresAt: null,
    passwordChangedAt: now,
  });

  return { email: admin.email };
}

module.exports = { readInvitation, acceptInvitation, readToken };
