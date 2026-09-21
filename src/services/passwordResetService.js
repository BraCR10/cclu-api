const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { Member } = require('../models/Member');
const { Admin } = require('../models/Admin');
const { PasswordResetRequest } = require('../models/PasswordResetRequest');
const { ROLES } = require('../config/roles');
const { readPassword, ValidationError, refuse, CODES } = require('../config/memberRules');
const { normalizeEmail } = require('./accountService');
const passwordService = require('./passwordService');
const emailService = require('./emailService');

const TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;
const MINUTES_VALID = 30;

const ACCOUNTS = {
  [ROLES.MEMBER]: Member,
  [ROLES.ADMIN]: Admin,
};

// A password needs a slow hash because a person chose it and the space is
// small. This token is 256 random bits, so there is nothing to guess and a fast
// digest is what lets the database find it by index instead of trying each one.
function digestOf(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readToken(value) {
  if (typeof value !== 'string' || !TOKEN_SHAPE.test(value.trim())) {
    refuse(CODES.INVALID_CODE, 'token', 'The link is not valid.');
  }

  return value.trim();
}

function expired() {
  return new ValidationError(
    CODES.INVALID_CODE,
    'token',
    'The link is not valid or has expired.',
    404,
  );
}

// Built here rather than in the template, because only the API knows the token
// and where the site answers.
function resetUrlFor(token, origin = process.env.WEB_ORIGIN) {
  return origin === undefined ? undefined : `${origin.replace(/\/+$/, '')}/password/reset/${token}`;
}

function findAccountById(identity) {
  const model = ACCOUNTS[identity?.role];

  return model === undefined ? null : model.findById(identity.id).select('email passwordHash');
}

// Registration and create-admin both refuse an address the other role holds,
// but that is a rule about new accounts and says nothing about what is already
// stored. An address that opens two of them has no single answer here, and
// guessing would reset the wrong account and leave the other unrecoverable.
//
// Nothing is sent in that case and nothing different is answered: a reply that
// changed shape would tell a stranger which addresses are interesting.
// scripts/audit-shared-emails.js reports them so they can be repaired.
async function findAccountByEmail(email, accounts = ACCOUNTS) {
  const address = normalizeEmail(email);

  if (address === '') {
    return null;
  }

  const found = [];

  for (const [role, model] of Object.entries(accounts)) {
    const account = await model.findOne({ email: address }).select('email');

    if (account !== null) {
      found.push({ account, role });
    }
  }

  if (found.length > 1) {
    console.warn('Password reset skipped: the address opens more than one account', {
      roles: found.map(({ role }) => role),
    });

    return null;
  }

  return found[0] ?? null;
}

// Asking again replaces the previous link, so only the newest one works.
function saveRequest(account, role, fields) {
  return PasswordResetRequest.findOneAndUpdate(
    { account, role },
    { $set: fields },
    { upsert: true },
  );
}

function findRequest(digest) {
  return PasswordResetRequest.findOne({ tokenDigest: digest });
}

// Delivery is the operation here, not a notice beside it. If the message does
// not leave, the person has no way to continue and must be told.
async function issueResetLink(account, role, save, sendEmail) {
  const token = randomBytes(TOKEN_BYTES).toString('hex');

  await save(account._id, role, {
    tokenDigest: digestOf(token),
    expiresAt: new Date(Date.now() + MINUTES_VALID * 60 * 1000),
  });

  await sendEmail('passwordResetLink', account.email, {
    resetUrl: resetUrlFor(token),
    minutesValid: MINUTES_VALID,
  });

  return { minutesValid: MINUTES_VALID };
}

// The current password is asked for first and the request goes no further
// without it, so holding somebody's open session is not enough to make the
// chamber send them a link.
async function requestResetFromSession(
  identity,
  body,
  find = findAccountById,
  save = saveRequest,
  sendEmail = emailService.sendEmail,
) {
  const account = await find(identity);

  if (account === null) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  const currentPassword = body?.currentPassword;
  const matches =
    typeof currentPassword === 'string' &&
    (await passwordService.verifyPassword(currentPassword, account.passwordHash));

  if (!matches) {
    throw new ValidationError(
      CODES.INVALID_CURRENT_PASSWORD,
      'currentPassword',
      'The current password is not correct.',
      401,
    );
  }

  return issueResetLink(account, identity.role, save, sendEmail);
}

// Somebody here has forgotten their password, so there is nothing to ask them
// for but the address. The answer is the same whether or not it is an account:
// told apart, this becomes a way of asking the chamber who belongs to it.
//
// The account-dependent work (minting the token, writing it, sending the mail)
// is scheduled and not awaited, so the answer returns just as fast for an
// address that exists as for one that does not. The lookup itself remains a
// single indexed read for both, so no message carries the timing of anything
// heavier than that.
async function requestForgottenPassword(
  body,
  find = findAccountByEmail,
  save = saveRequest,
  sendEmail = emailService.sendEmail,
  schedule = scheduleBackgroundWork,
) {
  const found = await find(body?.email);

  if (found !== null) {
    schedule(() => issueResetLink(found.account, found.role, save, sendEmail), found.role);
  }

  return { minutesValid: MINUTES_VALID };
}

// Runs the account-dependent work after the response has left. A failure here
// must not change the answer that was already sent, so it is reported and
// dropped: the person can simply ask again. Nothing sensitive is logged.
function scheduleBackgroundWork(work, role) {
  setImmediate(() => {
    work().catch((error) => {
      console.error('Password reset was not delivered, the person can ask again', {
        role,
        reason: error.message,
      });
    });
  });
}

async function readResetRequest(rawToken, locate = findRequest) {
  const token = readToken(rawToken);
  const request = await locate(digestOf(token));

  if (request === null || request === undefined) {
    throw expired();
  }

  // Compared in constant time although the lookup already matched, so the shape
  // of a near miss cannot be measured.
  const stored = Buffer.from(request.tokenDigest ?? '', 'utf8');
  const offered = Buffer.from(digestOf(token), 'utf8');

  if (stored.length !== offered.length || !timingSafeEqual(stored, offered)) {
    throw expired();
  }

  // An expired document may still be here: the database sweeps them on its own
  // schedule, so the date is checked rather than trusted to be gone.
  if (request.expiresAt.getTime() <= Date.now()) {
    throw expired();
  }

  return request;
}

// Answers whether the link still opens, without saying whose it is. The screen
// behind it needs to know before showing a form somebody cannot submit.
async function checkResetLink(rawToken, locate = findRequest) {
  await readResetRequest(rawToken, locate);

  return { valid: true, minutesValid: MINUTES_VALID };
}

async function completePasswordReset(body, locate = findRequest, accounts = ACCOUNTS) {
  const request = await readResetRequest(body?.token, locate);
  const newPassword = readPassword(body === null ? {} : body, 'newPassword');
  const model = accounts[request.role];

  const account = model === undefined ? null : await model.findById(request.account);

  if (account === null) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  account.passwordHash = await passwordService.hashPassword(newPassword);
  await account.save();

  // The link has done its work and must not open a second change.
  await request.deleteOne();

  return { changed: true };
}

module.exports = {
  requestResetFromSession,
  requestForgottenPassword,
  checkResetLink,
  completePasswordReset,
  readResetRequest,
  findAccountByEmail,
  resetUrlFor,
  digestOf,
  scheduleBackgroundWork,
  MINUTES_VALID,
};
