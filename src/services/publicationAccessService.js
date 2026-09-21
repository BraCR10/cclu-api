const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { PATTERNS } = require('../config/memberRules');
const { hasPaidMembership } = require('./membershipService');
const { effectiveMemberState, MEMBER_STATES } = require('./accountService');

const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 50;

// What every publication may say about the commerce behind it (CA-MKT-009-08
// and its siblings): the public contact card, built field by field.
const BUSINESS_FIELDS =
  'businessName memberCode email phone location whatsappNumber instagram facebook linkedin ' +
  'website paidUntil applicationStatus accountStatus';

const BUSINESS_POPULATE = {
  path: 'member',
  select: BUSINESS_FIELDS,
  populate: [
    { path: 'canton', select: 'name' },
    { path: 'sector', select: 'name' },
  ],
};

function presentBusiness(member) {
  if (member === null || member === undefined || typeof member !== 'object') {
    return null;
  }

  return {
    businessName: member.businessName,
    memberCode: member.memberCode ?? null,
    email: member.email,
    phone: member.phone,
    location: member.location,
    whatsappNumber: member.whatsappNumber ?? null,
    instagram: member.instagram ?? null,
    facebook: member.facebook ?? null,
    linkedin: member.linkedin ?? null,
    website: member.website ?? null,
    canton: member.canton?.name ?? null,
    sector: member.sector?.name ?? null,
  };
}

// Whether the commerce behind a publication may be shown to the public at all:
// approved, not suspended, and with the paid membership that publishing takes.
function isOwnerVisible(member, now = () => new Date()) {
  if (member === null || member === undefined || typeof member !== 'object') {
    return false;
  }

  return effectiveMemberState(member) === MEMBER_STATES.ACTIVE && hasPaidMembership(member, now);
}

// The ids of every member whose publications are visible right now, optionally
// narrowed by canton or sector. Resolved before the publication query so that
// skip and limit count only what will actually be shown.
function findVisibleOwnerIds({ canton, sector } = {}, now = () => new Date()) {
  const filter = {
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
    paidUntil: { $gt: now() },
  };

  if (typeof canton === 'string' && PATTERNS.objectId.test(canton)) {
    filter.canton = canton;
  }

  if (typeof sector === 'string' && PATTERNS.objectId.test(sector)) {
    filter.sector = sector;
  }

  return Member.find(filter)
    .select('_id')
    .lean()
    .then((members) => members.map((member) => member._id));
}

function readPage(value) {
  const page = Number.parseInt(value, 10);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readLimit(value) {
  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAXIMUM_LIMIT);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textFilter(value) {
  return typeof value === 'string' && value.trim() !== ''
    ? new RegExp(escapeRegex(value.trim()), 'i')
    : undefined;
}

module.exports = {
  BUSINESS_POPULATE,
  presentBusiness,
  isOwnerVisible,
  findVisibleOwnerIds,
  readPage,
  readLimit,
  escapeRegex,
  textFilter,
};
