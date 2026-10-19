const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { Member } = require('../models/Member');
const { ROLES } = require('../config/roles');
const { readText, ValidationError, refuse } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const accountService = require('./accountService');
const emailService = require('./emailService');

const TOKEN_BYTES = 32;
const MINUTES_VALID = 30;
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;
const DUPLICATE_KEY = 11000;

// A password needs a slow hash because a person chose it and the space is
// small. This token is 256 random bits, so there is nothing to guess and a fast
// digest is what lets the database find it by index instead of trying each one.
function digestOf(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readToken(value) {
  if (typeof value !== 'string' || !TOKEN_SHAPE.test(value.trim())) {
    refuse(ERROR_CODES.INVALID_CODE, 'token', 'The link is not valid.');
  }

  return value.trim();
}

function expired() {
  return new ValidationError(
    ERROR_CODES.INVALID_CODE,
    'token',
    'The link is not valid or has expired.',
    404,
  );
}

// Built here rather than in the template, because only the API knows the token
// and where the site answers.
function confirmUrlFor(token, origin = process.env.WEB_ORIGIN) {
  return origin === undefined ? undefined : `${origin.replace(/\/+$/, '')}/email/confirm/${token}`;
}

function defaultFind(memberId) {
  return Member.findById(memberId).select('email').lean();
}

function defaultSave(memberId, fields) {
  return Member.updateOne({ _id: memberId }, { $set: fields });
}

function findByDigest(digest) {
  return Member.findOne({ emailChangeTokenHash: digest }).select(
    'email pendingEmail emailChangeExpiresAt emailChangeTokenHash',
  );
}

function defaultApply(memberId, email) {
  return Member.updateOne(
    { _id: memberId },
    {
      $set: { email },
      // The link has done its work. Leaving it alive would let the same message
      // be replayed after the address it carried was already applied.
      $unset: { pendingEmail: '', emailChangeTokenHash: '', emailChangeExpiresAt: '' },
    },
  );
}

function unusable() {
  return new ValidationError(
    ERROR_CODES.ALREADY_REGISTERED,
    'email',
    'That address cannot be used.',
    409,
  );
}

// A change is asked for from the profile and nothing about the account moves
// until the address being claimed answers. Asking again replaces the previous
// link, so only the newest one works.
async function requestEmailChange(
  memberId,
  body,
  {
    find = defaultFind,
    save = defaultSave,
    held = accountService.emailHeldByAnotherRole,
    send = emailService.sendEmail,
  } = {},
) {
  const address = accountService.normalizeEmail(readText(body, 'email', { required: true }));
  const member = await find(memberId);

  if (member === null || member === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  if (member.email === address) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, 'email', 'That is already the address of the account.');
  }

  // The one thing the system cannot resolve is two accounts behind one address,
  // which is why the question is asked of every role rather than of members.
  if (await held(address, ROLES.MEMBER)) {
    throw unusable();
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex');

  await save(memberId, {
    pendingEmail: address,
    emailChangeTokenHash: digestOf(token),
    emailChangeExpiresAt: new Date(Date.now() + MINUTES_VALID * 60 * 1000),
  });

  // Delivery is the operation here: without the message the person has no way to
  // confirm, so a mail server that is down is a failure and not a notice.
  await send('emailChangeLink', address, {
    confirmUrl: confirmUrlFor(token),
    currentEmail: member.email,
    minutesValid: MINUTES_VALID,
  });

  return { email: address, minutesValid: MINUTES_VALID };
}

async function readPending(rawToken, find) {
  const token = readToken(rawToken);
  const member = await find(digestOf(token));

  if (member === null || member === undefined) {
    throw expired();
  }

  // Compared in constant time although the lookup already matched, so the shape
  // of a near miss cannot be measured.
  const stored = Buffer.from(member.emailChangeTokenHash ?? '', 'utf8');
  const offered = Buffer.from(digestOf(token), 'utf8');

  if (stored.length !== offered.length || !timingSafeEqual(stored, offered)) {
    throw expired();
  }

  if (member.emailChangeExpiresAt === null || member.emailChangeExpiresAt.getTime() <= Date.now()) {
    throw expired();
  }

  if (typeof member.pendingEmail !== 'string' || member.pendingEmail === '') {
    throw expired();
  }

  return member;
}

// Answers which address the link would apply, without applying it, so the screen
// behind it can say what is about to change.
async function readEmailChange(rawToken, find = findByDigest) {
  const member = await readPending(rawToken, find);

  return { email: member.pendingEmail };
}

// The link does the whole of it: confirming is the click, so the address and the
// spent token are written together.
async function confirmEmailChange(rawToken, find = findByDigest, apply = defaultApply) {
  const member = await readPending(rawToken, find);
  const email = member.pendingEmail;

  try {
    await apply(member._id, email);
  } catch (error) {
    // Somebody else registered the address between the request and the click,
    // and the unique index is what knows it.
    if (error.code === DUPLICATE_KEY) {
      throw unusable();
    }

    throw error;
  }

  return { email };
}

module.exports = {
  requestEmailChange,
  readEmailChange,
  confirmEmailChange,
  confirmUrlFor,
  digestOf,
  MINUTES_VALID,
};
