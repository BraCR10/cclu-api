const { randomBytes, createHash } = require('node:crypto');
const { Admin } = require('../models/Admin');
const { ADMIN_ACCOUNT_STATUSES, effectiveAdminState } = require('../config/accountStatus');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readText, readChoice, refuse, PATTERNS } = require('../config/memberRules');
const { normalizeEmail, emailHeldByAnotherRole } = require('./accountService');
const passwordService = require('./passwordService');
const emailService = require('./emailService');
const { ROLES } = require('../config/roles');

const TOKEN_BYTES = 32;
const DAYS_VALID = 7;

// The token in the link is 256 random bits, so there is nothing to guess and a
// fast digest is what lets the database find it by index.
function digestOf(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Built here rather than in the template, because only the API knows the token
// and where the site answers.
function invitationUrlFor(token, origin = process.env.WEB_ORIGIN) {
  return origin === undefined
    ? undefined
    : `${origin.replace(/\/+$/, '')}/admin/invitation/${token}`;
}

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That administrator does not exist.', {
    statusCode: 404,
  });
}

// What the directory shows. The state is the effective one, so an invitation
// that ran out of time reads as expired without anybody writing it down.
function present(admin, now = new Date()) {
  return {
    id: String(admin._id),
    name: admin.name ?? null,
    email: admin.email,
    status: effectiveAdminState(admin, now),
    invitationExpiresAt: admin.invitationExpiresAt ?? null,
    createdAt: admin.createdAt ?? null,
  };
}

async function readEmail(body) {
  const email = readText(body, 'email', { required: true });

  if (!PATTERNS.email.test(email)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'email', 'The address is not an email address.');
  }

  return normalizeEmail(email);
}

const defaultStore = {
  list: () =>
    Admin.find({}).select('name email accountStatus invitationExpiresAt createdAt').lean(),
  findById: (adminId) =>
    Admin.findById(adminId).select('name email accountStatus invitationExpiresAt').lean(),
  findByEmail: (email) => Admin.findOne({ email }).select('_id').lean(),
  create: async (fields) => (await Admin.create(fields)).toObject(),
  update: (adminId, changes) =>
    Admin.findByIdAndUpdate(adminId, { $set: changes }, { returnDocument: 'after' })
      .select('name email accountStatus invitationExpiresAt createdAt')
      .lean(),
  heldByOtherRole: (email) => emailHeldByAnotherRole(email, ROLES.ADMIN),
  send: (templateName, to, data) => emailService.sendEmail(templateName, to, data),
};

async function listAdmins(now = new Date(), store = defaultStore) {
  const admins = await store.list();

  return { items: admins.map((admin) => present(admin, now)) };
}

// A new invitation, whether it is the first one or a replacement for one that
// ran out. The token is returned to the caller so the mail can carry it, and
// stored only as a digest.
function freshInvitation(now) {
  const token = randomBytes(TOKEN_BYTES).toString('hex');

  return {
    token,
    changes: {
      invitationTokenHash: digestOf(token),
      invitationExpiresAt: new Date(now.getTime() + DAYS_VALID * 24 * 60 * 60 * 1000),
      accountStatus: ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING,
    },
  };
}

async function inviteAdmin(actorId, body, now = new Date(), store = defaultStore) {
  const name = readText(body, 'name', { required: true });
  const email = await readEmail(body);

  // One address, one account: a member's address cannot also open the panel,
  // and an administrator cannot be invited twice.
  if ((await store.heldByOtherRole(email)) || (await store.findByEmail(email)) !== null) {
    refuse(
      ERROR_CODES.ALREADY_REGISTERED,
      'email',
      'That address already belongs to an account.',
      409,
    );
  }

  const { token, changes } = freshInvitation(now);
  const created = await store.create({
    name,
    email,
    // Nothing can be signed in with this: the account is invitation_pending and
    // the password is replaced the moment the invitation is accepted.
    passwordHash: await passwordService.hashPassword(randomBytes(TOKEN_BYTES).toString('hex')),
    ...changes,
  });

  await store.send('adminInvitation', email, {
    invitationUrl: invitationUrlFor(token),
    invitedBy: await actorName(actorId, store),
    daysValid: DAYS_VALID,
  });

  return present(created, now);
}

// A new link for an invitation that never arrived, or one that ran out. It
// restarts the clock rather than extending it.
async function resendInvitation(actorId, adminId, now = new Date(), store = defaultStore) {
  const admin = await store.findById(adminId);

  if (admin === null || admin === undefined) {
    throw notFound();
  }

  const state = effectiveAdminState(admin, now);

  if (
    state !== ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING &&
    state !== ADMIN_ACCOUNT_STATUSES.INVITATION_EXPIRED
  ) {
    refuse(
      ERROR_CODES.NOT_ALLOWED,
      null,
      'This administrator already has a password, so there is no invitation to resend.',
    );
  }

  const { token, changes } = freshInvitation(now);
  const updated = await store.update(adminId, changes);

  await store.send('adminInvitation', admin.email, {
    invitationUrl: invitationUrlFor(token),
    invitedBy: await actorName(actorId, store),
    daysValid: DAYS_VALID,
  });

  return present(updated ?? admin, now);
}

// The mail names who invited whom, so the invitation is not anonymous.
async function actorName(actorId, store) {
  const actor = await store.findById(actorId);

  return actor?.name ?? actor?.email;
}

// Inactivating and reactivating are the two moves the panel has. An invitation
// is not one of them: it is resent, which is its own action.
async function setAdminStatus(actorId, adminId, body, now = new Date(), store = defaultStore) {
  if (String(actorId) === String(adminId)) {
    refuse(ERROR_CODES.NOT_ALLOWED, null, 'An administrator cannot inactivate themselves.');
  }

  const admin = await store.findById(adminId);

  if (admin === null || admin === undefined) {
    throw notFound();
  }

  const status = readChoice(body, 'status', [
    ADMIN_ACCOUNT_STATUSES.ACTIVE,
    ADMIN_ACCOUNT_STATUSES.INACTIVE,
  ]);
  const updated = await store.update(adminId, { accountStatus: status });

  return present(updated ?? admin, now);
}

module.exports = {
  listAdmins,
  inviteAdmin,
  resendInvitation,
  setAdminStatus,
  present,
  digestOf,
  invitationUrlFor,
  DAYS_VALID,
};
