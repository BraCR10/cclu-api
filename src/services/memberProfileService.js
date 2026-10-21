const { Member, MEMBER_TYPES, BRANCH_MODALITIES } = require('../models/Member');
const { Canton } = require('../models/Canton');
const { Activity } = require('../models/Activity');
const {
  readText,
  readChoice,
  readReference,
  readCalendarDate,
  readFileKey,
  ValidationError,
  refuse,
} = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { effectiveMemberState } = require('./accountService');

// Named one by one. A field absent from these lists cannot be changed here, so
// a body carrying an application status or a member code simply goes unread.
// What is here is what the profile's popups edit: the business, the branch, how
// to reach it, and the legal data behind it. The identification that names the
// applicant, the address of the account and the password are not, because each
// of them has a flow of its own.
const EDITABLE_TEXT_FIELDS = [
  'phone',
  'whatsappNumber',
  'businessName',
  'managerName',
  'businessDescription',
  'branchName',
  'district',
  'institutionalPhone',
  'billingEmail',
  'legalName',
  'legalRepresentativeName',
  'legalRepresentativeIdentification',
];
const OPTIONAL_TEXT_FIELDS = ['location', 'activityOther', 'instagram', 'facebook', 'linkedin'];
const OPTIONAL_LINK_FIELDS = ['logoUrl', 'website'];
const EDITABLE_REFERENCE_FIELDS = [
  { field: 'canton', model: Canton },
  { field: 'activity', model: Activity },
];
const EDITABLE_CHOICE_FIELDS = [
  { field: 'memberType', allowed: Object.values(MEMBER_TYPES) },
  { field: 'branchModality', allowed: Object.values(BRANCH_MODALITIES) },
];

// What the member sees of their own record. The password hash and the reviewer
// who decided are not among them.
const PROFILE_FIELD_NAMES = [
  ...EDITABLE_TEXT_FIELDS,
  ...OPTIONAL_TEXT_FIELDS,
  ...OPTIONAL_LINK_FIELDS,
  'email',
  'name',
  'legalName',
  'legalRepresentativeName',
  'legalRepresentativeIdentification',
  'certificationFileKey',
  'certificationIssuedAt',
  'managerName',
  'activity',
  'activityOther',
  'logoFileKey',
  'branchModality',
  'branchName',
  'district',
  'institutionalPhone',
  'billingEmail',
  'consents',
  'consentedAt',
  'memberType',
  'identificationType',
  'identificationNumber',
  'memberCode',
  'applicationStatus',
  'accountStatus',
  'statusReason',
  'passwordChangedAt',
  'createdAt',
];
const PROFILE_FIELDS = PROFILE_FIELD_NAMES.join(' ');

function findProfile(memberId) {
  return Member.findById(memberId)
    .select(PROFILE_FIELDS)
    .populate('canton', 'name province')
    .populate('activity', 'name')
    .lean();
}

// A record written before a field existed, or one an optional field was removed
// from, holds nothing for it, and a lean read applies no schema default. Every
// field is named anyway, as null, so a screen never meets one that is missing.
function withEveryFieldNamed(member) {
  const named = {};

  for (const field of PROFILE_FIELD_NAMES) {
    named[field] = member[field] ?? null;
  }

  return { ...named, ...member };
}

// The raw pair of statuses never leaves the API on its own; what goes out is
// the state they add up to.
function presentProfile(member) {
  const { applicationStatus, accountStatus, ...rest } = withEveryFieldNamed(member);

  return { ...rest, state: effectiveMemberState({ applicationStatus, accountStatus }) };
}

async function readProfile(memberId, find = findProfile) {
  const member = await find(memberId);

  if (member === null || member === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  return presentProfile(member);
}

async function buildChanges(body, references = EDITABLE_REFERENCE_FIELDS) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The profile body is missing.');
  }

  const changes = {};
  const unset = {};

  for (const field of EDITABLE_TEXT_FIELDS) {
    if (field in body) {
      changes[field] = readText(body, field, { required: true });
    }
  }

  // An optional field sent empty is a removal, which is the only way a member
  // can take a social account back off their public listing.
  for (const field of [...OPTIONAL_TEXT_FIELDS, ...OPTIONAL_LINK_FIELDS]) {
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

  for (const { field, allowed } of EDITABLE_CHOICE_FIELDS) {
    if (field in body) {
      changes[field] = readChoice(body, field, allowed);
    }
  }

  for (const { field, model } of references) {
    if (field in body) {
      changes[field] = await readReference(body, field, model);
    }
  }

  // The personería jurídica is replaced as a pair: the document and the day it
  // was issued, because one without the other says nothing about the other.
  if ('certificationFileKey' in body) {
    changes.certificationFileKey = readFileKey(body, 'certificationFileKey', { required: true });
  }

  if ('certificationIssuedAt' in body) {
    changes.certificationIssuedAt = readCalendarDate(body, 'certificationIssuedAt', {
      required: true,
    });
  }

  if (Object.keys(changes).length === 0 && Object.keys(unset).length === 0) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
  }

  return { changes, unset };
}

async function updateProfile(
  memberId,
  body,
  apply = (id, update) =>
    Member.findByIdAndUpdate(id, update, { returnDocument: 'after', runValidators: true })
      .select(PROFILE_FIELDS)
      .populate('canton', 'name province')
      .populate('activity', 'name')
      .lean(),
  references = EDITABLE_REFERENCE_FIELDS,
) {
  const { changes, unset } = await buildChanges(body, references);
  const update = { $set: changes };

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  const updated = await apply(memberId, update);

  if (updated === null || updated === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That account no longer exists.',
      404,
    );
  }

  return presentProfile(updated);
}

module.exports = { readProfile, updateProfile, buildChanges, EDITABLE_TEXT_FIELDS };
