const { randomInt } = require('node:crypto');
const { Member } = require('../models/Member');
const { Admin } = require('../models/Admin');
const { PasswordChangeRequest } = require('../models/PasswordChangeRequest');
const { ROLES } = require('../config/roles');
const { readPassword, ValidationError, refuse, CODES } = require('../config/memberRules');
const passwordService = require('./passwordService');
const emailService = require('./emailService');

const CODE_DIGITS = 6;
const MINUTES_VALID = 15;
const MAXIMUM_ATTEMPTS = 5;

const ACCOUNTS = {
  [ROLES.MEMBER]: Member,
  [ROLES.ADMIN]: Admin,
};

// Six digits, drawn whole rather than digit by digit, so every code in the
// range is equally likely.
function newCode() {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
}

function readCode(body) {
  const code = body === null || typeof body !== 'object' ? undefined : body.code;

  if (typeof code !== 'string' || !new RegExp(`^[0-9]{${CODE_DIGITS}}$`).test(code.trim())) {
    refuse(CODES.INVALID_FORMAT, 'code', 'The verification code is not valid.');
  }

  return code.trim();
}

function findAccount(identity) {
  const model = ACCOUNTS[identity?.role];

  return model === undefined ? null : model.findById(identity.id).select('email passwordHash');
}

// Asking again replaces the previous code, so only the newest one works.
function saveRequest(account, role, fields) {
  return PasswordChangeRequest.findOneAndUpdate(
    { account, role },
    { $set: fields },
    { upsert: true },
  );
}

function findRequest(account, role) {
  return PasswordChangeRequest.findOne({ account, role });
}

// The current password is asked for first and the request goes no further
// without it, so holding someone's open session is not enough to take their
// account.
async function requestPasswordChange(
  identity,
  body,
  find = findAccount,
  sendEmail = emailService.sendEmail,
  save = saveRequest,
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

  const code = newCode();
  const expiresAt = new Date(Date.now() + MINUTES_VALID * 60 * 1000);

  await save(account._id, identity.role, {
    codeHash: await passwordService.hashPassword(code),
    expiresAt,
    attempts: 0,
  });

  // Delivery is the operation here, not a notice beside it. If the message does
  // not leave, the person has no way to continue and must be told.
  await sendEmail('passwordChangeCode', account.email, { code, minutesValid: MINUTES_VALID });

  return { minutesValid: MINUTES_VALID };
}

function invalidCode(message = 'The verification code is not valid or has expired.') {
  return new ValidationError(CODES.INVALID_CODE, 'code', message, 400);
}

async function confirmPasswordChange(identity, body, find = findAccount, locate = findRequest) {
  const code = readCode(body);
  const newPassword = readPassword(body === null ? {} : body, 'newPassword');

  const account = await find(identity);

  if (account === null) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  const request = await locate(account._id, identity.role);

  // An expired document may still be here: the database sweeps them on its own
  // schedule, so the date is checked rather than trusted to be gone.
  if (request === null || request.expiresAt.getTime() <= Date.now()) {
    throw invalidCode();
  }

  if (request.attempts >= MAXIMUM_ATTEMPTS) {
    await request.deleteOne();
    throw invalidCode('Too many attempts. Ask for a new code.');
  }

  if (!(await passwordService.verifyPassword(code, request.codeHash))) {
    request.attempts += 1;
    await request.save();
    throw invalidCode();
  }

  account.passwordHash = await passwordService.hashPassword(newPassword);
  await account.save();

  // The code has done its work and must not open a second change.
  await request.deleteOne();

  return { changed: true };
}

module.exports = {
  requestPasswordChange,
  confirmPasswordChange,
  MINUTES_VALID,
  MAXIMUM_ATTEMPTS,
  CODE_DIGITS,
};
