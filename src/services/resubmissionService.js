const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { ValidationError, CODES, refuse, readText } = require('../config/memberRules');

const TOKEN_BYTES = 32;
const DAYS_VALID = 30;
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

// A password needs a slow hash because a person chose it and the space is
// small. This token is 256 random bits, so there is nothing to guess and a fast
// digest is what lets the database find it by index instead of trying each one.
function digestOf(token) {
  return createHash('sha256').update(token).digest('hex');
}

function readToken(value) {
  if (typeof value !== 'string' || !TOKEN_SHAPE.test(value.trim())) {
    refuse(CODES.INVALID_CODE, 'token', 'The resubmission link is not valid.');
  }

  return value.trim();
}

function expired() {
  return new ValidationError(
    CODES.INVALID_CODE,
    'token',
    'The resubmission link is not valid or has expired.',
    404,
  );
}

// Issued when a registration is rejected, and it is the only proof the person
// coming back owns it. Without one, anybody who learned a rejected address
// could resubmit in their name and set a password of their own.
async function issueResubmissionToken(memberId, save = defaultSave) {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + DAYS_VALID * 24 * 60 * 60 * 1000);

  await save(memberId, {
    resubmissionTokenHash: digestOf(token),
    resubmissionExpiresAt: expiresAt,
  });

  return { token, expiresAt };
}

function defaultSave(memberId, fields) {
  return Member.updateOne({ _id: memberId }, { $set: fields });
}

function findByDigest(digest) {
  return Member.findOne({ resubmissionTokenHash: digest });
}

// What the person may see of their own rejected registration: the fields they
// are here to correct, and why it was refused.
const CORRECTABLE = [
  'phone',
  'location',
  'businessName',
  'businessDescription',
  'whatsappNumber',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'logoUrl',
];

async function findRejectedByToken(rawToken, find = findByDigest) {
  const token = readToken(rawToken);
  const member = await find(digestOf(token));

  if (member === null || member === undefined) {
    throw expired();
  }

  // Compared in constant time although the lookup already matched, so the shape
  // of a near miss cannot be measured.
  const stored = Buffer.from(member.resubmissionTokenHash ?? '', 'utf8');
  const offered = Buffer.from(digestOf(token), 'utf8');

  if (stored.length !== offered.length || !timingSafeEqual(stored, offered)) {
    throw expired();
  }

  if (
    member.resubmissionExpiresAt === null ||
    member.resubmissionExpiresAt.getTime() <= Date.now()
  ) {
    throw expired();
  }

  // Only a rejection opens this door. An application already approved or back
  // under review has nothing to resubmit.
  if (member.applicationStatus !== APPLICATION_STATUSES.REJECTED) {
    throw expired();
  }

  return member;
}

async function readRejectedRegistration(rawToken, find = findByDigest) {
  const member = await findRejectedByToken(rawToken, find);
  const registration = {};

  for (const field of CORRECTABLE) {
    registration[field] = member[field] ?? null;
  }

  return {
    ...registration,
    email: member.email,
    businessName: member.businessName,
    reason: member.statusReason ?? null,
  };
}

const REQUIRED = ['phone', 'location', 'businessName', 'businessDescription'];

// The corrections are read one field at a time, so the body cannot carry a new
// address, an application status or anything else the chamber decides.
function buildCorrections(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The resubmission body is missing.');
  }

  const changes = {};
  const unset = {};

  for (const field of REQUIRED) {
    changes[field] = readText(body, field, { required: true });
  }

  for (const field of CORRECTABLE.filter((name) => !REQUIRED.includes(name))) {
    if (!(field in body)) {
      continue;
    }

    const value = readText(body, field, { required: false });

    if (value === undefined) {
      unset[field] = '';
    } else {
      changes[field] = value;
    }
  }

  return { changes, unset };
}

// The rejected registration is reused rather than replaced, which is what keeps
// the same address from colliding with its own earlier application.
async function resubmitRegistration(rawToken, body, find = findByDigest) {
  const member = await findRejectedByToken(rawToken, find);
  const { changes, unset } = buildCorrections(body);

  Object.assign(member, changes);

  for (const field of Object.keys(unset)) {
    member[field] = undefined;
  }

  member.applicationStatus = APPLICATION_STATUSES.PENDING_REVIEW;
  member.statusReason = undefined;
  member.reviewedBy = null;
  member.reviewedAt = null;

  // The link has done its work. Leaving it alive would let somebody resubmit
  // again over an application already back under review.
  member.resubmissionTokenHash = null;
  member.resubmissionExpiresAt = null;

  await member.save();

  return { id: String(member._id), applicationStatus: member.applicationStatus };
}

module.exports = {
  issueResubmissionToken,
  resubmitRegistration,
  buildCorrections,
  readRejectedRegistration,
  findRejectedByToken,
  digestOf,
  CORRECTABLE,
  DAYS_VALID,
};
