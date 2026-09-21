const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Membership, MEMBERSHIP_TYPES, MEMBERSHIP_STATUSES } = require('../models/Membership');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { refuse, readChoice, CODES, ValidationError } = require('../config/memberRules');
const { effectiveMemberState } = require('./accountService');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// What a membership's dates are read as. The field the web sends may be a date
// or a deliberate "no expiration", so the value is validated before it is
// written rather than stored as whatever the database happens to accept.
function readExpiration(value, field = 'expiresAt') {
  if (value === null || value === '' || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    refuse(CODES.INVALID_FORMAT, field, `The field ${field} is not a valid date.`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    refuse(CODES.INVALID_FORMAT, field, `The field ${field} is not a valid date.`);
  }

  return date;
}

function readMemberId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    refuse(CODES.INVALID_FORMAT, 'memberId', 'The member identifier is not valid.');
  }

  return value;
}

function notFound() {
  return new ValidationError(
    CODES.UNKNOWN_REFERENCE,
    null,
    'No member exists with that identifier.',
    404,
  );
}

// The member account status is one of the three the chamber controls. A member
// may only be moved between these in this one place.
const MEMBER_ACCOUNT_STATUSES = [
  ACCOUNT_STATUSES.ACTIVE,
  ACCOUNT_STATUSES.SUSPENDED,
  ACCOUNT_STATUSES.TERMINATED,
];

// A list item is what the panel shows: who the member is and what state they
// and their membership are in, brought together from two collections.
const MEMBER_FIELDS = [
  'email',
  'businessName',
  'memberCode',
  'applicationStatus',
  'accountStatus',
].join(' ');

async function listMembers(read = defaultList) {
  return read();
}

function defaultList() {
  return Member.find({ applicationStatus: APPLICATION_STATUSES.APPROVED })
    .select(MEMBER_FIELDS)
    .sort({ businessName: 1 })
    .lean();
}

// Joins each member to their membership. A member may predate the membership
// collection, so the join cannot require one: the panel shows "none" rather
// than hiding the member.
async function readMembers(list = defaultList, memberships = readAllMemberships) {
  const members = await list();
  const catalog = await memberships();

  return members.map((member) => {
    const membership = catalog.get(String(member._id));

    return {
      id: String(member._id),
      email: member.email,
      businessName: member.businessName,
      memberCode: member.memberCode ?? null,
      accountStatus: member.accountStatus,
      state: effectiveMemberState(member),
      membership:
        membership === undefined
          ? null
          : {
              type: membership.type,
              status: membership.status,
              expiresAt: membership.expiresAt,
            },
    };
  });
}

async function readAllMemberships() {
  const memberships = await Membership.find().lean();
  const catalog = new Map();

  for (const membership of memberships) {
    catalog.set(String(membership.member), membership);
  }

  return catalog;
}

// The three member-level actions map onto accountStatus. They are the only
// values accepted, and nothing else in the body is read.
async function updateMemberStatus(memberId, body, save = saveMemberStatus) {
  const id = readMemberId(memberId);
  const status = readChoice(
    body === null || typeof body !== 'object' ? {} : body,
    'accountStatus',
    MEMBER_ACCOUNT_STATUSES,
  );

  const member = await save(id, { accountStatus: status });

  if (member === null || member === undefined) {
    throw notFound();
  }

  return {
    id: String(member._id),
    accountStatus: member.accountStatus,
    state: effectiveMemberState({
      applicationStatus: member.applicationStatus,
      accountStatus: member.accountStatus,
    }),
  };
}

function saveMemberStatus(id, fields) {
  return Member.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' })
    .select('accountStatus applicationStatus')
    .lean();
}

// The membership is edited one field at a time: type, status, and expiration.
// A body carrying a member reference or anything else is simply never read.
const EDITABLE_MEMBERSHIP_FIELDS = {
  type: { allowed: Object.values(MEMBERSHIP_TYPES) },
  status: { allowed: Object.values(MEMBERSHIP_STATUSES) },
};

async function updateMembership(memberId, body, save = saveMembership) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The membership body is missing.');
  }

  const id = readMemberId(memberId);
  const changes = {};

  for (const [field, { allowed }] of Object.entries(EDITABLE_MEMBERSHIP_FIELDS)) {
    if (field in body) {
      changes[field] = readChoice(body, field, allowed);
    }
  }

  if ('expiresAt' in body) {
    changes.expiresAt = readExpiration(body.expiresAt);
  }

  if (Object.keys(changes).length === 0) {
    refuse(CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
  }

  const membership = await save(id, changes);

  if (membership === null || membership === undefined) {
    throw notFound();
  }

  return {
    id: String(membership._id),
    memberId: String(membership.member),
    type: membership.type,
    status: membership.status,
    expiresAt: membership.expiresAt,
  };
}

function saveMembership(memberId, fields) {
  return Membership.findOneAndUpdate(
    { member: memberId },
    { $set: fields },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

module.exports = {
  listMembers,
  readMembers,
  updateMemberStatus,
  updateMembership,
  readExpiration,
  readMemberId,
  MEMBER_ACCOUNT_STATUSES,
  EDITABLE_MEMBERSHIP_FIELDS,
};
