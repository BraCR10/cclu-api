const { Member } = require('../models/Member');
const { normalizeMemberCode, isMemberCodeValid, formatMemberCode } = require('./memberCodeService');
const { effectiveMemberState, MEMBER_STATES } = require('./accountService');
const { ValidationError, CODES } = require('../config/memberRules');
const { createDownloadUrl } = require('./fileStorageService');
const { PUBLIC_FIELDS } = require('../config/memberPublicFields');
const { presentPublicMember } = require('./memberPublicPresenter');

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

async function readPublicProfile(rawCode, find = findPublicByCode, sign = createDownloadUrl) {
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

  return presentPublicMember(member, sign);
}

module.exports = { verifyMemberCode, readPublicProfile };
