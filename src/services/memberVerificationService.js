const { Member } = require('../models/Member');
const { normalizeMemberCode, isMemberCodeValid, formatMemberCode } = require('./memberCodeService');
const { effectiveMemberState, MEMBER_STATES } = require('./accountService');
const { ValidationError, CODES } = require('../config/memberRules');

// What one member may learn about another from a code: enough to recognise the
// business in front of them, and nothing that belongs to the account.
const VISIBLE_FIELDS = 'businessName memberType memberCode applicationStatus accountStatus';

function findByCode(code) {
  return Member.findOne({ memberCode: code })
    .select(VISIBLE_FIELDS)
    .populate('canton', 'name province')
    .populate('sector', 'name')
    .lean();
}

const UNKNOWN = { valid: false };

// One answer for a code that was never issued, one that belongs to a suspended
// account and one that was mistyped. Telling them apart would turn this into a
// way of reading the chamber's roll one code at a time.
async function verifyMemberCode(body, find = findByCode) {
  const code = normalizeMemberCode(body === null || typeof body !== 'object' ? null : body.code);

  // The check digit settles a mistyped code here, without a lookup.
  if (code === null || !isMemberCodeValid(code)) {
    return UNKNOWN;
  }

  const member = await find(code);

  if (member === null || member === undefined) {
    return UNKNOWN;
  }

  if (effectiveMemberState(member) !== MEMBER_STATES.ACTIVE) {
    return UNKNOWN;
  }

  return {
    valid: true,
    member: {
      memberCode: formatMemberCode(member.memberCode),
      businessName: member.businessName,
      memberType: member.memberType,
      sector: member.sector?.name ?? null,
      canton: member.canton?.name ?? null,
    },
  };
}

// The public entry. Named field by field rather than by removing what must not
// leave, because a field added to the model later would otherwise arrive here
// on its own. The address is left out on purpose: it is what someone signs in
// with, and a directory needs the telephone and the site, not the credential.
const PUBLIC_FIELDS = [
  'businessName',
  'businessDescription',
  'memberType',
  'memberCode',
  'location',
  'phone',
  'whatsappNumber',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'logoUrl',
  'createdAt',
  'applicationStatus',
  'accountStatus',
].join(' ');

function findPublicByCode(code) {
  return Member.findOne({ memberCode: code })
    .select(PUBLIC_FIELDS)
    .populate('canton', 'name province')
    .populate('sector', 'name')
    .lean();
}

function notListed() {
  return new ValidationError(
    CODES.UNKNOWN_REFERENCE,
    'memberCode',
    'No affiliate is listed under that code.',
    404,
  );
}

// Built rather than filtered. Handing back the document and trusting a screen
// not to paint a field would still send it to the browser.
async function readPublicProfile(rawCode, find = findPublicByCode) {
  const code = normalizeMemberCode(rawCode);

  if (code === null || !isMemberCodeValid(code)) {
    throw notListed();
  }

  const member = await find(code);

  if (member === null || member === undefined) {
    throw notListed();
  }

  // A suspended or rejected affiliate has no public listing, and says so the
  // same way a code that was never issued does.
  if (effectiveMemberState(member) !== MEMBER_STATES.ACTIVE) {
    throw notListed();
  }

  return {
    memberCode: formatMemberCode(member.memberCode),
    businessName: member.businessName,
    businessDescription: member.businessDescription,
    memberType: member.memberType,
    sector: member.sector?.name ?? null,
    canton: member.canton?.name ?? null,
    province: member.canton?.province ?? null,
    location: member.location,
    phone: member.phone,
    whatsappNumber: member.whatsappNumber ?? null,
    instagram: member.instagram ?? null,
    facebook: member.facebook ?? null,
    linkedin: member.linkedin ?? null,
    website: member.website ?? null,
    logoUrl: member.logoUrl ?? null,
    affiliatedSince: member.createdAt,
  };
}

module.exports = { verifyMemberCode, readPublicProfile };
