const { Membership } = require('../models/Membership');
const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');

const DUPLICATE_KEY = 11000;

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

function present(membership, member) {
  const { lapsed } = membership;

  return {
    memberCode: member.memberCode,
    plan: presentPlan(membership.plan),
    startedAt: membership.startedAt,
    expiresAt: membership.expiresAt,
    lapsed:
      lapsed === null || lapsed === undefined
        ? null
        : {
            plan: { key: lapsed.plan.key, name: lapsed.plan.name },
            expiredAt: lapsed.expiredAt,
          },
  };
}

const defaultMembershipStore = {
  findMember: (memberId) =>
    Member.findById(memberId).select('memberCode applicationStatus reviewedAt').lean(),
  findMembership: (memberId) =>
    Membership.findOne({ member: memberId })
      .populate('plan', 'key name monthlyFee entitlements')
      .populate('lapsed.plan', 'key name')
      .lean(),
  grant: (memberId, startedAt) => grantFreeMembership(memberId, startedAt),
};

// Approval grants the membership, but a member approved before memberships
// existed, or whose grant was cut short, still has one the first time they ask.
async function readOwnMembership(memberId, store = defaultMembershipStore) {
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
    await store.grant(memberId, member.reviewedAt ?? new Date());
    membership = await store.findMembership(memberId);
  }

  return present(membership, member);
}

module.exports = { grantFreeMembership, readOwnMembership };
