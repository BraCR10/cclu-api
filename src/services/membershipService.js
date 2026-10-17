const { Membership } = require('../models/Membership');
const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const clock = require('../config/clock');
const { isValidInstant, lastValidDay } = require('../config/chamberCalendar');
const { formatMemberCode } = require('./memberCodeService');
const { isExpiredPaidPlan } = require('./entitlementService');

const DUPLICATE_KEY = 11000;
const PLAN_FIELDS = 'key name monthlyFee entitlements';

function findFreePlan() {
  return Plan.findOne({ key: PLAN_KEYS.FREE }).select('_id').lean();
}

// Written only when missing, so approving twice, seeding again or two requests
// racing each other leave the one membership that is already there.
async function grantFreeMembership(memberId, startedAt = new Date(), findPlan = findFreePlan) {
  const freePlan = await findPlan();

  if (freePlan === null || freePlan === undefined) {
    throw new ApplicationError(ERROR_CODES.INTERNAL_ERROR, 'The plans have not been seeded.', {
      statusCode: 500,
    });
  }

  try {
    await Membership.updateOne(
      { member: memberId },
      { $setOnInsert: { member: memberId, plan: freePlan._id, startedAt } },
      { upsert: true },
    );
  } catch (error) {
    // Two upserts that both found nothing: the unique index lets one in, and
    // the other has nothing left to do.
    if (error.code !== DUPLICATE_KEY) {
      throw error;
    }
  }
}

function presentPlan(plan) {
  return {
    key: plan.key,
    name: plan.name,
    monthlyFee: plan.monthlyFee,
    entitlements: { ...plan.entitlements },
  };
}

function presentLapse(plan, expiredAt) {
  return { plan: { key: plan.key, name: plan.name }, validUntil: lastValidDay(expiredAt) };
}

// What the member is shown is the plan they hold now. A paid plan past its
// expiry reads as Gratuita with its lapse, even before the hourly job has moved
// it, so the screen never promises what the API would refuse. The expiry
// itself is not sent: the last valid day is what a person reads, and the
// instant would name the day after.
function present(membership, member, freePlan, now) {
  const { lapsed } = membership;
  const common = { memberCode: formatMemberCode(member.memberCode) };

  if (isExpiredPaidPlan(membership, now)) {
    return {
      ...common,
      plan: presentPlan(freePlan),
      startedAt: isValidInstant(membership.expiresAt) ? membership.expiresAt : null,
      validUntil: null,
      lapsed: presentLapse(membership.plan, membership.expiresAt),
    };
  }

  return {
    ...common,
    plan: presentPlan(membership.plan),
    startedAt: membership.startedAt,
    validUntil: membership.plan.key === PLAN_KEYS.FREE ? null : lastValidDay(membership.expiresAt),
    lapsed:
      lapsed === null || lapsed === undefined ? null : presentLapse(lapsed.plan, lapsed.expiredAt),
  };
}

const defaultMembershipStore = {
  findMember: (memberId) =>
    Member.findById(memberId).select('memberCode applicationStatus reviewedAt').lean(),
  findMembership: (memberId) =>
    Membership.findOne({ member: memberId })
      .populate('plan', PLAN_FIELDS)
      .populate('lapsed.plan', 'key name')
      .lean(),
  findFreePlan: () => Plan.findOne({ key: PLAN_KEYS.FREE }).select(PLAN_FIELDS).lean(),
  grant: (memberId, startedAt) => grantFreeMembership(memberId, startedAt),
};

// Approval grants the membership, but a member approved before memberships
// existed, or whose grant was cut short, still has one the first time they ask.
async function readOwnMembership(memberId, store = defaultMembershipStore, now = clock.now()) {
  const member = await store.findMember(memberId);

  if (member === null || member === undefined) {
    throw new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That account no longer exists.', {
      statusCode: 404,
    });
  }

  if (member.applicationStatus !== APPLICATION_STATUSES.APPROVED) {
    throw new ApplicationError(ERROR_CODES.NOT_ALLOWED, 'Only an approved member has a plan.', {
      statusCode: 403,
    });
  }

  let membership = await store.findMembership(memberId);

  if (membership === null || membership === undefined) {
    await store.grant(memberId, member.reviewedAt ?? now);
    membership = await store.findMembership(memberId);
  }

  return present(membership, member, await store.findFreePlan(), now);
}

module.exports = { grantFreeMembership, readOwnMembership };
