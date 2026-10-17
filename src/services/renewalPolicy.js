const { PLAN_KEYS } = require('../models/Plan');
const { calendarDayOf, expiryFrom, isValidInstant } = require('../config/chamberCalendar');
const { isExpiredPaidPlan } = require('./entitlementService');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const RENEWAL_FREQUENCY = 'monthly';

// Whether the member holds a paid plan that is still running. Only then is
// there a current term to wait for or to extend.
function holdsRunningPaidPlan(membership, now) {
  return (
    membership !== null &&
    membership !== undefined &&
    membership.plan?.key !== PLAN_KEYS.FREE &&
    !isExpiredPaidPlan(membership, now)
  );
}

// The moment a running plan can be renewed: the start of the notice before it
// ends, the same notice that reminds the member and lists the plan as expiring
// soon.
function renewalOpensAt(expiresAt, noticeDays) {
  return new Date(expiresAt.getTime() - noticeDays * DAY_IN_MILLISECONDS);
}

// A member on Gratuita may pay whenever they like. A member on a running paid
// plan may pay only inside the window, so a term is paid for once.
function renewalWindow(membership, now, noticeDays) {
  if (!holdsRunningPaidPlan(membership, now)) {
    return { open: true, opensAt: null, opensOn: null };
  }

  const opensAt = renewalOpensAt(membership.expiresAt, noticeDays);

  return { open: now >= opensAt, opensAt, opensOn: calendarDayOf(opensAt) };
}

// The period an approval grants. A running plan is extended from its own end,
// so paying inside the window costs no days. Anything else starts at the
// approval. A month from the last valid day lands on the same day of the next
// month, clamped at month ends.
function termFor(membership, approvedAt) {
  if (holdsRunningPaidPlan(membership, approvedAt) && isValidInstant(membership.expiresAt)) {
    const startsAt = membership.expiresAt;

    return {
      startsAt,
      expiresAt: expiryFrom(new Date(startsAt.getTime() - 1), RENEWAL_FREQUENCY),
    };
  }

  return { startsAt: approvedAt, expiresAt: expiryFrom(approvedAt, RENEWAL_FREQUENCY) };
}

module.exports = { RENEWAL_FREQUENCY, holdsRunningPaidPlan, renewalWindow, termFor };
