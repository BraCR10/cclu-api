const { Membership } = require('../models/Membership');
const { Plan, PLAN_KEYS, BANNER_ALLOWANCES } = require('../models/Plan');
const { isValidInstant, latestTrustedExpiry } = require('../config/chamberCalendar');

// How each entitlement is read. A name missing here is not an entitlement, and
// nothing can be granted through it.
const ENTITLEMENT_CHECKS = Object.freeze({
  publishInMarketplace: (value) => value === true,
  publishJobs: (value) => value === true,
  onlineWorkshops: (value) => value === true,
  massMailing: (value) => value === true,
  banner: (value) => value === BANNER_ALLOWANCES.ONE_MONTH || value === BANNER_ALLOWANCES.UNLIMITED,
});

function isEntitlementName(name) {
  return Object.hasOwn(ENTITLEMENT_CHECKS, name);
}

function grants(plan, name) {
  return isEntitlementName(name) && ENTITLEMENT_CHECKS[name](plan?.entitlements?.[name]);
}

// Whether a paid term still holds at this moment. The term is half open: valid
// while now is before the expiry, over from the expiry itself. Anything that
// cannot be read as such a term fails closed, because the cost of a wrong
// answer is a paid plan that never ends.
function isTermCurrent(expiresAt, now) {
  return (
    isValidInstant(now) &&
    isValidInstant(expiresAt) &&
    now < expiresAt &&
    expiresAt <= latestTrustedExpiry(now)
  );
}

// The one rule for whether a member still holds the paid plan stored on their
// membership. The stored plan only says what was paid for; when this answers
// true the member holds Gratuita, whether or not the hourly job has moved the
// record yet. The middleware and the membership screen ask it, and the hourly
// run's query matches the same cases.
function isExpiredPaidPlan(membership, now) {
  return membership.plan.key !== PLAN_KEYS.FREE && !isTermCurrent(membership.expiresAt, now);
}

const PLAN_FIELDS = 'key name monthlyFee entitlements';

const defaultEntitlementStore = {
  findMembership: (memberId) =>
    Membership.findOne({ member: memberId }).populate('plan', PLAN_FIELDS).lean(),
  findFreePlan: () => Plan.findOne({ key: PLAN_KEYS.FREE }).select(PLAN_FIELDS).lean(),
};

// A member with no membership row holds Gratuita. Reading never writes, so a
// check on a hot path costs one indexed query, and a second only when the plan
// has run out.
async function readEffectivePlan(memberId, now, store = defaultEntitlementStore) {
  const membership = await store.findMembership(memberId);

  if (membership === null || membership === undefined || membership.plan === null) {
    return store.findFreePlan();
  }

  return isExpiredPaidPlan(membership, now) ? store.findFreePlan() : membership.plan;
}

module.exports = {
  ENTITLEMENT_NAMES: Object.keys(ENTITLEMENT_CHECKS),
  isEntitlementName,
  grants,
  isTermCurrent,
  isExpiredPaidPlan,
  readEffectivePlan,
};
