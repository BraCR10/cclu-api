const { Member, MEMBER_TYPES } = require('../models/Member');
const { Canton } = require('../models/Canton');
const { Sector } = require('../models/Sector');
const { Membership } = require('../models/Membership');
const {
  readText,
  readChoice,
  readReference,
  ValidationError,
  refuse,
  CODES,
} = require('../config/memberRules');
const { effectiveMemberState } = require('./accountService');
const { createDownloadUrl } = require('./fileStorageService');

// Named one by one. A field absent from these lists cannot be changed here, so
// a body carrying an application status or a member code simply goes unread.
const EDITABLE_TEXT_FIELDS = ['phone', 'location', 'businessName', 'businessDescription'];
const OPTIONAL_TEXT_FIELDS = ['whatsappNumber', 'instagram', 'facebook', 'linkedin'];
const OPTIONAL_LINK_FIELDS = ['logoUrl', 'website'];
const EDITABLE_REFERENCE_FIELDS = [
  { field: 'canton', model: Canton },
  { field: 'sector', model: Sector },
];
const EDITABLE_CHOICE_FIELDS = [{ field: 'memberType', allowed: Object.values(MEMBER_TYPES) }];

// What the member sees of their own record. The password hash and the reviewer
// who decided are not among them.
const PROFILE_FIELDS = [
  ...EDITABLE_TEXT_FIELDS,
  ...OPTIONAL_TEXT_FIELDS,
  ...OPTIONAL_LINK_FIELDS,
  'email',
  'memberType',
  'identificationType',
  'identificationNumber',
  'memberCode',
  'applicationStatus',
  'accountStatus',
  'statusReason',
  'createdAt',
  'logoKey',
].join(' ');

function findProfile(memberId) {
  return Member.findById(memberId)
    .select(PROFILE_FIELDS)
    .populate('canton', 'name province')
    .populate('sector', 'name')
    .lean();
}

// The raw pair of statuses never leaves the API on its own; what goes out is
// the state they add up to. Likewise logoKey: a member who uploaded a logo
// carries a key, never an address, so what leaves here is a signed address
// computed fresh, never one saved from an earlier request.
async function presentProfile(member, sign = createDownloadUrl) {
  const { applicationStatus, accountStatus, logoKey, ...rest } = member;
  const logoUrl = logoKey ? await sign(logoKey) : (rest.logoUrl ?? null);

  return {
    ...rest,
    logoUrl,
    state: effectiveMemberState({ applicationStatus, accountStatus }),
  };
}

async function readProfile(memberId, find = findProfile, sign = createDownloadUrl) {
  const member = await find(memberId);

  if (member === null || member === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  return presentProfile(member, sign);
}

async function buildChanges(body, references = EDITABLE_REFERENCE_FIELDS) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The profile body is missing.');
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

    // A logo set or cleared by hand replaces whatever the upload endpoint
    // stored, so the two never disagree about which address is current.
    if (field === 'logoUrl') {
      unset.logoKey = '';
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
    refuse(CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
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
      .populate('sector', 'name')
      .lean(),
  references = EDITABLE_REFERENCE_FIELDS,
  sign = createDownloadUrl,
) {
  const { changes, unset } = await buildChanges(body, references);
  const update = { $set: changes };

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  const updated = await apply(memberId, update);

  if (updated === null || updated === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  return presentProfile(updated, sign);
}

// The member's own membership, not somebody else's. A member may predate the
// membership collection, so "no membership yet" is a valid answer rather than
// an error.
async function readMembership(memberId, find = (id) => Membership.findOne({ member: id }).lean()) {
  const membership = await find(memberId);

  if (membership === null || membership === undefined) {
    return { id: null, type: null, status: null, expiresAt: null };
  }

  return {
    id: String(membership._id),
    type: membership.type,
    status: membership.status,
    expiresAt: membership.expiresAt,
  };
}

module.exports = { readProfile, updateProfile, buildChanges, EDITABLE_TEXT_FIELDS, readMembership };
