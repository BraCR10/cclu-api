const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Membership } = require('../models/Membership');
const { Payment, PAYMENT_STATUSES } = require('../models/Payment');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { latestTrustedExpiry, startOfChamberMonth } = require('../config/chamberCalendar');
const { listMemberships, MEMBERSHIP_LIST_VIEWS } = require('./adminMembershipService');
const { countBoardVacancies } = require('./jobBoardService');
const { countVisible: countVisiblePublications } = require('./marketplaceService');

const EXPIRING_SHOWN = '4';

const LISTED = {
  applicationStatus: APPLICATION_STATUSES.APPROVED,
  accountStatus: { $ne: ACCOUNT_STATUSES.SUSPENDED },
};

// A paid plan whose term holds right now, matching the rule access uses.
function currentPaidTerm(now) {
  return { expiresAt: { $gt: now, $lte: latestTrustedExpiry(now) } };
}

const defaultStore = {
  countMembers: (filter) => Member.countDocuments({ ...LISTED, ...filter }),
  listedMemberIds: () => Member.distinct('_id', LISTED),
  oldestPendingApplication: () =>
    Member.findOne({ applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean(),
  countPendingApplications: () =>
    Member.countDocuments({ applicationStatus: APPLICATION_STATUSES.PENDING_REVIEW }),
  oldestPendingPayment: () =>
    Payment.findOne({ status: PAYMENT_STATUSES.PENDING_REVIEW })
      .sort({ submittedAt: 1 })
      .select('submittedAt')
      .lean(),
  countPendingPayments: () => Payment.countDocuments({ status: PAYMENT_STATUSES.PENDING_REVIEW }),
  findPlans: () => Plan.find().select('key name').lean(),
  countPaidByPlan: (memberIds, paidPlanIds, now, since) =>
    Membership.aggregate([
      {
        $match: { member: { $in: memberIds }, plan: { $in: paidPlanIds }, ...currentPaidTerm(now) },
      },
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 },
          startedThisMonth: { $sum: { $cond: [{ $gte: ['$startedAt', since] }, 1, 0] } },
        },
      },
    ]),
  listExpiring: (now) =>
    listMemberships({ view: MEMBERSHIP_LIST_VIEWS.EXPIRING, pageSize: EXPIRING_SHOWN }, now),
  countVacancies: (now) => countBoardVacancies(now),
  countPublications: (now) => countVisiblePublications(now),
};

function membershipsByPlan(plans, paidCounts, listedCount) {
  const byPlanId = new Map(paidCounts.map((row) => [String(row._id), row]));
  const paidTotal = paidCounts.reduce((sum, row) => sum + row.count, 0);

  // Everybody listed without a paid plan in force holds Gratuita, whatever the
  // hourly run has or has not moved yet.
  const order = Object.values(PLAN_KEYS);

  return [...plans]
    .sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key))
    .map((plan) => ({
      key: plan.key,
      name: plan.name,
      count:
        plan.key === PLAN_KEYS.FREE
          ? Math.max(listedCount - paidTotal, 0)
          : (byPlanId.get(String(plan._id))?.count ?? 0),
    }));
}

// A-01: what the chamber's day starts with. Every figure is read now; nothing
// here is stored or cached, so it always agrees with the lists it leads to.
async function readSummary(now, store = defaultStore) {
  const since = startOfChamberMonth(now);
  const [plans, memberIds, members, newMembers] = await Promise.all([
    store.findPlans(),
    store.listedMemberIds(),
    store.countMembers({}),
    store.countMembers({ reviewedAt: { $gte: since } }),
  ]);
  const paidPlanIds = plans.filter((plan) => plan.key !== PLAN_KEYS.FREE).map((plan) => plan._id);
  const [
    paidCounts,
    pendingApplications,
    oldestApplication,
    pendingPayments,
    oldestPayment,
    expiring,
    vacancies,
    publications,
  ] = await Promise.all([
    store.countPaidByPlan(memberIds, paidPlanIds, now, since),
    store.countPendingApplications(),
    store.oldestPendingApplication(),
    store.countPendingPayments(),
    store.oldestPendingPayment(),
    store.listExpiring(now),
    store.countVacancies(now),
    store.countPublications(now),
  ]);

  return {
    members: { total: members, newThisMonth: newMembers },
    applications: {
      pending: pendingApplications,
      oldestSubmittedAt: oldestApplication?.createdAt ?? null,
    },
    payments: { pending: pendingPayments, oldestSubmittedAt: oldestPayment?.submittedAt ?? null },
    paidMemberships: {
      active: paidCounts.reduce((sum, row) => sum + row.count, 0),
      newThisMonth: paidCounts.reduce((sum, row) => sum + row.startedThisMonth, 0),
    },
    membershipsByPlan: membershipsByPlan(plans, paidCounts, members),
    publications: { active: publications },
    vacancies: { active: vacancies },
    expiring: { items: expiring.items, total: expiring.total, noticeDays: expiring.noticeDays },
  };
}

module.exports = { readSummary, membershipsByPlan };
