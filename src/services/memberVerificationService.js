const { Member } = require('../models/Member');
const { normalizeMemberCode, isMemberCodeValid, formatMemberCode } = require('./memberCodeService');
const { effectiveMemberState, MEMBER_STATES } = require('./accountService');
const { ValidationError } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { Branch } = require('../models/Branch');
// Registered here because the profile populates cantons and activities, and
// nothing guarantees another module loaded them first.
require('../models/Canton');
require('../models/Activity');
const { BRANCH_MODALITIES } = require('../models/Member');
const { PLAN_KEYS } = require('../models/Plan');
const clock = require('../config/clock');
const { readEffectivePlan } = require('./entitlementService');
const { presentStore } = require('./storeService');

// What one member may learn about another from a code: enough to recognise the
// business in front of them, and nothing that belongs to the account.
const VISIBLE_FIELDS =
  'businessName memberType memberCode applicationStatus accountStatus activity activityOther';

function findByCode(code) {
  return Member.findOne({ memberCode: code })
    .select(VISIBLE_FIELDS)
    .populate('canton', 'name province')
    .populate('activity', 'name')
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
      activity: member.activity?.name ?? member.activityOther ?? null,
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
  'activity',
  'activityOther',
  'location',
  'phone',
  'whatsappNumber',
  'instagram',
  'facebook',
  'linkedin',
  'website',
  'logoUrl',
  'logoFileKey',
  'storeCategories',
  'storeSchedule',
  'branchModality',
  'branchName',
  'district',
  'createdAt',
  'applicationStatus',
  'accountStatus',
].join(' ');

function findPublicByCode(code) {
  return Member.findOne({ memberCode: code })
    .select(PUBLIC_FIELDS)
    .populate('canton', 'name province')
    .populate('activity', 'name')
    .populate('storeCategories', 'name')
    .lean();
}

const defaultPublicDetails = {
  findBranches: (memberId) =>
    Branch.find({ member: memberId, removedAt: null })
      .sort({ isPrimary: -1, createdAt: 1 })
      .populate('canton', 'name')
      .lean(),
  readPlan: (memberId, now) => readEffectivePlan(memberId, now),
};

// Where a client finds the business. The municipal permit is the chamber's and
// never leaves. A member whose record predates branches is shown the place on
// its registration, the way the directory places it.
function publicBranches(member, branches) {
  if (branches.length > 0) {
    return branches.map((branch) => ({
      name: branch.name,
      isPrimary: branch.isPrimary === true,
      canton: branch.canton?.name ?? null,
      district: branch.district,
      address: branch.address,
      phone: branch.phone ?? null,
      schedule: branch.schedule ?? null,
    }));
  }

  if (member.branchModality === BRANCH_MODALITIES.VIRTUAL || !member.branchName) {
    return [];
  }

  return [
    {
      name: member.branchName,
      isPrimary: true,
      canton: member.canton?.name ?? null,
      district: member.district ?? null,
      address: member.location ?? null,
      phone: null,
      schedule: null,
    },
  ];
}

function paidPlanOf(plan) {
  return plan === null || plan === undefined || plan.key === PLAN_KEYS.FREE
    ? null
    : { key: plan.key, name: plan.name };
}

function notListed() {
  return new ValidationError(
    ERROR_CODES.UNKNOWN_REFERENCE,
    'memberCode',
    'No affiliate is listed under that code.',
    404,
  );
}

// Built rather than filtered. Handing back the document and trusting a screen
// not to paint a field would still send it to the browser.
async function readPublicProfile(
  rawCode,
  find = findPublicByCode,
  details = defaultPublicDetails,
  now = clock.now(),
) {
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

  const [branches, plan] = await Promise.all([
    details.findBranches(member._id),
    details.readPlan(member._id, now),
  ]);
  const store = presentStore(member);

  return {
    memberCode: formatMemberCode(member.memberCode),
    businessName: member.businessName,
    businessDescription: member.businessDescription,
    memberType: member.memberType,
    activity: member.activity?.name ?? member.activityOther ?? null,
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
    logoFileKey: member.logoFileKey ?? null,
    affiliatedSince: member.createdAt,
    plan: paidPlanOf(plan),
    branches: publicBranches(member, branches),
    categories: store.categories.map((category) => category.name),
    schedule: store.schedule,
  };
}

module.exports = { verifyMemberCode, readPublicProfile };
