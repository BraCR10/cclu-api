const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const {
  Member,
  APPLICATION_STATUSES,
  MEMBER_TYPES,
  IDENTIFICATION_TYPES,
} = require('../models/Member');
const { Canton } = require('../models/Canton');
const { Activity } = require('../models/Activity');
const { IDENTIFICATION_TYPES_BY_MEMBER_TYPE } = require('./memberRegistrationService');
const {
  ValidationError,
  refuse,
  readText,
  readChoice,
  readReference,
} = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const notificationService = require('./notificationService');
const { NOTIFICATION_TYPES } = require('../models/Notification');

const TOKEN_BYTES = 32;
const DAYS_VALID = 30;
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
    refuse(ERROR_CODES.INVALID_CODE, 'token', 'The resubmission link is not valid.');
  }

  return value.trim();
}

function expired() {
  return new ValidationError(
    ERROR_CODES.INVALID_CODE,
    'token',
    'The resubmission link is not valid or has expired.',
    404,
  );
}

// Issued when a registration is rejected or sent back for corrections, and it is
// the only proof the person coming back owns it. Without one, anybody who
// learned a rejected address could resubmit in their name and set a password of
// their own.
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

// The reviewer travels with the answer, so the applicant is told who decided
// rather than that somebody did.
function findByDigest(digest) {
  return Member.findOne({ resubmissionTokenHash: digest }).populate('reviewedBy', 'name email');
}

// The two answers that leave the applicant with something to do: a rejection to
// try again, and a request to fix what the chamber named. A link that outlived
// either would let somebody resubmit over an application already dealt with.
const CORRECTABLE_STATUSES = [
  APPLICATION_STATUSES.REJECTED,
  APPLICATION_STATUSES.CHANGES_REQUESTED,
];

// What the correction screen shows: who is applying, the business, and how to
// reach it. Everything else the registration carries is preserved rather than
// corrected, which is why none of it is read here. The form keeps the same list
// in cclu-web, at src/modules/members/api/correction.ts.
const CORRECTABLE_FIELDS = [
  'memberType',
  'identificationType',
  'identificationNumber',
  'legalName',
  'name',
  'businessName',
  'managerName',
  'activity',
  'activityOther',
  'canton',
  'district',
  'phone',
  'whatsappNumber',
];

// What names the applicant, and therefore which of the two the form asks for.
// The one that does not go with the chosen type is cleared rather than kept: a
// person is not a company, and a company has no name of its own.
const IDENTITY_FIELDS_BY_MEMBER_TYPE = {
  [MEMBER_TYPES.BUSINESS]: ['legalName'],
  [MEMBER_TYPES.ASSOCIATION]: ['legalName'],
  [MEMBER_TYPES.INDEPENDENT_PROFESSIONAL]: ['name'],
};

const IDENTITY_FIELDS = ['legalName', 'name'];

const REQUIRED_TEXT_FIELDS = ['businessName', 'managerName', 'district', 'phone', 'whatsappNumber'];

const OPTIONAL_TEXT_FIELDS = ['activityOther'];

const REFERENCE_FIELDS = [
  { field: 'canton', model: Canton, required: true },
  { field: 'activity', model: Activity, required: false },
];

async function findCorrectableByToken(rawToken, find = findByDigest) {
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

  // Only these two states open the door. An application already approved, or one
  // back under review, has nothing to resubmit.
  if (!CORRECTABLE_STATUSES.includes(member.applicationStatus)) {
    throw expired();
  }

  return member;
}

// The administrator who answered, named the way the panel names them: the name
// they were invited with, and the address when they have none.
function reviewerOf(reviewedBy) {
  if (reviewedBy === null || typeof reviewedBy !== 'object') {
    return null;
  }

  return reviewedBy.name ?? reviewedBy.email ?? null;
}

// What the applicant sees when the link opens: every field they may correct, why
// the chamber is asking, what it said about each field it named, and who decided.
// Everything else travels along, which is what keeps the rest of the
// registration intact.
async function readCorrectableRegistration(rawToken, find = findByDigest) {
  const member = await findCorrectableByToken(rawToken, find);
  const registration = {};

  for (const field of CORRECTABLE_FIELDS) {
    registration[field] = member[field] ?? null;
  }

  return {
    ...registration,
    email: member.email,
    reason: member.statusReason ?? null,
    fields: member.changesRequestedFields ?? [],
    applicationStatus: member.applicationStatus,
    reviewedAt: member.reviewedAt ?? null,
    reviewedBy: reviewerOf(member.reviewedBy),
  };
}

// The corrections are read one field at a time against the rules a registration
// answers to, so a value nobody could have registered cannot be corrected in
// either. The body carries no address, no password, no application status and
// nothing else the chamber decides, because none of those is read here.
async function buildCorrections(body, references = REFERENCE_FIELDS) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The resubmission body is missing.');
  }

  const changes = {};
  const unset = {};

  // What the applicant is decides which of the fields below they are asked for,
  // so the choices come first, exactly as the registration reads them.
  const memberType = readChoice(body, 'memberType', Object.values(MEMBER_TYPES));
  const identificationType = readChoice(
    body,
    'identificationType',
    Object.values(IDENTIFICATION_TYPES),
  );

  if (!IDENTIFICATION_TYPES_BY_MEMBER_TYPE[memberType].includes(identificationType)) {
    refuse(
      ERROR_CODES.NOT_ALLOWED,
      'identificationType',
      'That identification type does not go with that member type.',
    );
  }

  changes.memberType = memberType;
  changes.identificationType = identificationType;
  changes.identificationNumber = readText(body, 'identificationNumber', { required: true });

  for (const field of IDENTITY_FIELDS_BY_MEMBER_TYPE[memberType]) {
    changes[field] = readText(body, field, { required: true });
  }

  for (const field of IDENTITY_FIELDS) {
    if (!(field in changes)) {
      unset[field] = '';
    }
  }

  for (const field of REQUIRED_TEXT_FIELDS) {
    changes[field] = readText(body, field, { required: true });
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = readText(body, field, { required: false });

    if (value === undefined) {
      unset[field] = '';
    } else {
      changes[field] = value;
    }
  }

  const found = await Promise.all(
    references.map(({ field, model, required }) =>
      readReference(body, field, model, { required: required ?? true }),
    ),
  );

  references.forEach(({ field }, index) => {
    if (found[index] !== undefined) {
      changes[field] = found[index];
    }
  });

  // The chamber classifies every member, so the activity is either one from the
  // catalog or one written out, and never neither.
  if (changes.activity === undefined && changes.activityOther === undefined) {
    refuse(ERROR_CODES.REQUIRED, 'activity', 'An activity is required.');
  }

  // One chosen from the catalog replaces the one that was written out: that is
  // what the catalog is for, and the approval would otherwise file the written
  // one a second time.
  if (changes.activity !== undefined) {
    delete changes.activityOther;
    unset.activityOther = '';
  }

  return { changes, unset };
}

// The rejected registration is reused rather than replaced, which is what keeps
// the same address from colliding with its own earlier application.
async function resubmitRegistration(
  rawToken,
  body,
  find = findByDigest,
  references = REFERENCE_FIELDS,
  notifyAdmins = notificationService.notifyAdmins,
) {
  const member = await findCorrectableByToken(rawToken, find);
  const { changes, unset } = await buildCorrections(body, references);

  Object.assign(member, changes);

  for (const field of Object.keys(unset)) {
    member[field] = undefined;
  }

  member.applicationStatus = APPLICATION_STATUSES.PENDING_REVIEW;
  member.statusReason = undefined;
  member.changesRequestedFields = undefined;
  member.reviewedBy = null;
  member.reviewedAt = null;

  // The link has done its work. Leaving it alive would let somebody resubmit
  // again over an application already back under review.
  member.resubmissionTokenHash = null;
  member.resubmissionExpiresAt = null;

  try {
    await member.save();
  } catch (error) {
    // The document identifier is unique across members, so a correction that
    // typed somebody else's is refused in the same words a registration uses
    // for an address that is already taken: naming the member who holds it
    // would turn this link into a way of asking who is affiliated.
    if (error.code === DUPLICATE_KEY) {
      throw new ValidationError(
        ERROR_CODES.ALREADY_REGISTERED,
        'identificationNumber',
        'The registration could not be completed. Contact the chamber for help.',
        409,
      );
    }

    throw error;
  }

  await notifyAdmins(NOTIFICATION_TYPES.APPLICATION_RESUBMITTED, {
    businessName: member.businessName,
  });

  return { id: String(member._id), applicationStatus: member.applicationStatus };
}

module.exports = {
  issueResubmissionToken,
  resubmitRegistration,
  buildCorrections,
  readCorrectableRegistration,
  findCorrectableByToken,
  digestOf,
  CORRECTABLE_FIELDS,
  CORRECTABLE_STATUSES,
  REQUIRED_TEXT_FIELDS,
  DAYS_VALID,
};
