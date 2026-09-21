const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { normalizeEmail, emailHeldByAnotherRole } = require('./accountService');
const { ROLES } = require('../config/roles');
const {
  refuse,
  readText,
  readChoice,
  readPassword,
  CODES,
  ValidationError,
} = require('../config/memberRules');
const passwordService = require('./passwordService');
const emailService = require('./emailService');

// 256 random bits, so there is nothing to guess and a fast digest is what lets
// the database find the account by index rather than trying each one.
const TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function digestOf(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Built here rather than in the template, because only the API knows the token
// and where the site answers.
function invitationUrlFor(token, origin = process.env.WEB_ORIGIN) {
  return origin === undefined ? undefined : `${origin.replace(/\/+$/, '')}/admin/invitation/${token}`;
}

// The address must look like an address before it is written anywhere. A value
// that is not a string stops being data and becomes part of a query.
function readEmail(body) {
  const value = body?.email;

  if (typeof value !== 'string' || value.trim() === '') {
    refuse(CODES.REQUIRED, 'email', 'The field email is required.');
  }

  const address = normalizeEmail(value);

  if (!EMAIL_PATTERN.test(address)) {
    refuse(CODES.INVALID_FORMAT, 'email', 'The field email is not in the expected format.');
  }

  return address;
}

// The number of days the invitation stays open, when it should expire at all.
// Called only when the boolean says so, so a missing number is never read.
function readDays(body) {
  const value = body?.expiresInDays;

  if (value === undefined || value === null || value === '') {
    refuse(CODES.REQUIRED, 'expiresInDays', 'The field expiresInDays is required.');
  }

  const days = Number(value);

  if (!Number.isFinite(days) || days <= 0) {
    refuse(CODES.INVALID_FORMAT, 'expiresInDays', 'The field expiresInDays must be positive.');
  }

  return days;
}

// The body decides whether the invitation closes on its own. A missing flag is
// read as "do not expire", which is the simpler case to accept silently.
function readExpires(body) {
  if (body === null || typeof body !== 'object') {
    return false;
  }

  const value = body.expires;

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }
  }

  return false;
}

// The administrator identifier arrives in the path, not the body. Checked here
// rather than trusted to the database, which would treat a wrong shape as an
// odd but matching-looking _id or throw its own error.
function readAdminId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    refuse(CODES.INVALID_FORMAT, 'administratorId', 'The administrator identifier is not valid.');
  }

  return value;
}

// A placeholder password stands in until the administrator accepts. Holding it
// keeps the schema's required field satisfied without ever being usable: the
// account is suspended and the token, not the password, is the way in.
function placeholderPasswordHash() {
  return passwordService.hashPassword(randomBytes(TOKEN_BYTES).toString('hex'));
}

function alreadyInvited() {
  return new ValidationError(
    CODES.ALREADY_REGISTERED,
    null,
    'That address is already taken. Contact the chamber for help.',
    409,
  );
}

function notFound() {
  return new ValidationError(
    CODES.UNKNOWN_REFERENCE,
    null,
    'No administrator exists with that identifier.',
    404,
  );
}

const DUPLICATE_KEY = 11000;

// Delivery is the operation here, not a notice beside it. If the message does
// not leave, the invitation points at nothing and nobody can accept it.
async function inviteAdministrator(
  identity,
  body,
  create = (document) => Admin.create(document),
  heldByAnotherRole = emailHeldByAnotherRole,
  sendEmail = emailService.sendEmail,
) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The invitation body is missing.');
  }

  const email = readEmail(body);
  const expires = readExpires(body);
  const days = expires ? readDays(body) : undefined;

  if (await heldByAnotherRole(email, ROLES.ADMIN)) {
    throw alreadyInvited();
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const document = {
    email,
    name: email,
    accountStatus: ACCOUNT_STATUSES.SUSPENDED,
    invitationTokenHash: digestOf(token),
    passwordHash: await placeholderPasswordHash(),
    invitedByAdmin: identity.id,
  };

  if (expires) {
    document.invitationExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  try {
    await create(document);
  } catch (error) {
    if (error.code === DUPLICATE_KEY) {
      throw alreadyInvited();
    }

    throw error;
  }

  await sendEmail('administratorInvitation', email, {
    invitationUrl: invitationUrlFor(token),
    daysValid: expires ? days : undefined,
  });

  return { sent: true, expires, ...(expires ? { daysValid: days } : {}) };
}

// What an administrator may see of another administrator's account.
function present(admin) {
  return {
    id: String(admin._id),
    name: admin.name ?? null,
    email: admin.email,
    accountStatus: admin.accountStatus,
    invitedByAdmin: admin.invitedByAdmin === null ? null : String(admin.invitedByAdmin),
  };
}

// Only the name and the address are here for an administrator to edit. Named
// explicitly rather than spread from the body, so a request carrying a role, a
// status or a password hash is simply never read.
async function updateAdministrator(identity, administratorId, body, save = defaultSave) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const id = readAdminId(administratorId);
  const fields = {};

  if ('name' in body) {
    fields.name = readText(body, 'name', { required: true });
  }

  if ('email' in body) {
    fields.email = readEmail(body);
  }

  if (Object.keys(fields).length === 0) {
    refuse(CODES.NOTHING_TO_CHANGE, null, 'Nothing was given to change.');
  }

  const admin = await save(id, fields);

  if (admin === null || admin === undefined) {
    throw notFound();
  }

  return present(admin);
}

function defaultSave(id, fields) {
  return Admin.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' }).lean();
}

// Activating or deactivating reads a single accepted value. Nothing else in the
// body is looked at, so a request cannot smuggle a role or a reset here.
async function updateAdministratorStatus(identity, administratorId, body, save = defaultSave) {
  const id = readAdminId(administratorId);
  const status = readChoice(body === null || typeof body !== 'object' ? {} : body, 'accountStatus', [
    ACCOUNT_STATUSES.ACTIVE,
    ACCOUNT_STATUSES.SUSPENDED,
  ]);

  const admin = await save(id, { accountStatus: status });

  if (admin === null || admin === undefined) {
    throw notFound();
  }

  return present(admin);
}

// The invitation link arrives by email and the person following it has no
// session yet, so the token is the only proof the address is theirs. The
// account stays suspended until the password is set in the same call.
function readInvitationToken(value) {
  if (typeof value !== 'string' || !TOKEN_SHAPE.test(value.trim())) {
    refuse(CODES.INVALID_CODE, 'token', 'The invitation link is not valid.');
  }

  return value.trim();
}

function inviteExpired() {
  return new ValidationError(
    CODES.INVALID_CODE,
    'token',
    'The invitation link is not valid or has expired.',
    404,
  );
}

function findByDigest(digest) {
  return Admin.findOne({ invitationTokenHash: digest });
}

// Answers whether the link still opens, without saying whose it is. The accept
// call runs the same check, so the two never disagree.
async function findInvitedAdmin(rawToken, find = findByDigest) {
  const token = readInvitationToken(rawToken);
  const admin = await find(digestOf(token));

  if (admin === null || admin === undefined) {
    throw inviteExpired();
  }

  // Compared in constant time although the lookup already matched, so the shape
  // of a near miss cannot be measured.
  const stored = Buffer.from(admin.invitationTokenHash ?? '', 'utf8');
  const offered = Buffer.from(digestOf(token), 'utf8');

  if (stored.length !== offered.length || !timingSafeEqual(stored, offered)) {
    throw inviteExpired();
  }

  // A non-expiring invitation has no date; one that does must not be past it.
  if (
    admin.invitationExpiresAt !== null &&
    admin.invitationExpiresAt !== undefined &&
    admin.invitationExpiresAt.getTime() <= Date.now()
  ) {
    throw inviteExpired();
  }

  return admin;
}

// The invitation ends in the only act that matters: choosing a password. Until
// then the account is suspended and the link is the only way in.
async function acceptInvitation(rawToken, body, find = findByDigest, hash = passwordService.hashPassword) {
  const admin = await findInvitedAdmin(rawToken, find);
  const password = readPassword(body === null ? {} : body);

  admin.passwordHash = await hash(password);
  admin.accountStatus = ACCOUNT_STATUSES.ACTIVE;

  // The link has done its work. Leaving it alive would let somebody set the
  // password again over an account already active.
  admin.invitationTokenHash = null;
  admin.invitationExpiresAt = null;
  admin.accountStatus = ACCOUNT_STATUSES.ACTIVE;

  await admin.save();

  return { id: String(admin._id), email: admin.email, accountStatus: admin.accountStatus };
}

module.exports = {
  inviteAdministrator,
  updateAdministrator,
  updateAdministratorStatus,
  acceptInvitation,
  findInvitedAdmin,
  readEmail,
  readDays,
  readExpires,
  readAdminId,
  digestOf,
  invitationUrlFor,
  present,
};
