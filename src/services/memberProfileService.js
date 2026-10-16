const { Member, MEMBER_TYPES } = require('../models/Member');
const { Canton } = require('../models/Canton');
const {
  readText,
  readChoice,
  readReference,
  ValidationError,
  refuse,
} = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { effectiveMemberState } = require('./accountService');

// Named one by one. A field absent from these lists cannot be changed here, so
// a body carrying an application status or a member code simply goes unread.
const EDITABLE_TEXT_FIELDS = [
  'phone',
  'whatsappNumber',
  'location',
  'businessName',
  'businessDescription',
];
const OPTIONAL_TEXT_FIELDS = ['instagram', 'facebook', 'linkedin'];
const OPTIONAL_LINK_FIELDS = ['logoUrl', 'website'];
const EDITABLE_REFERENCE_FIELDS = [{ field: 'canton', model: Canton }];
const EDITABLE_CHOICE_FIELDS = [{ field: 'memberType', allowed: Object.values(MEMBER_TYPES) }];

// What the member sees of their own record. The password hash and the reviewer
// who decided are not among them.
const PROFILE_FIELDS = [
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
  'createdAt',
].join(' ');

function findProfile(memberId) {
  return Member.findById(memberId)
    .select(PROFILE_FIELDS)
    .populate('canton', 'name province')
    .populate('activity', 'name')
    .lean();
}

// The raw pair of statuses never leaves the API on its own; what goes out is
// the state they add up to.
function presentProfile(member) {
  const { applicationStatus, accountStatus, ...rest } = member;

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
