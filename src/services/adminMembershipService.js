const mongoose = require('mongoose');
const { Membership } = require('../models/Membership');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { refuse } = require('../config/memberRules');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { escapeForRegex, readSearch } = require('../config/listSearch');
const { lastValidDay, latestTrustedExpiry } = require('../config/chamberCalendar');
const { formatMemberCode } = require('./memberCodeService');
const membershipPolicyService = require('./membershipPolicyService');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// The list is the chamber's view of who pays and who stopped. A paid plan in
// force is listed while it holds; one that ran out is listed as expired, with
// the plan it was on and the day it ended, because that is the member worth
// calling back.
const MEMBERSHIP_LIST_VIEWS = Object.freeze({
  ACTIVE: 'active',
  EXPIRING: 'expiring',
  EXPIRED: 'expired',
});

const PAID_PLAN_KEYS = [PLAN_KEYS.LITE, PLAN_KEYS.PRO, PLAN_KEYS.PREMIUM];

function readChoiceParameter(query, field, allowed, fallback) {
  const raw = query?.[field];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `${field} is one of ${allowed.join(', ')}.`);
  }

  return raw;
}

// Everything the list is asked for is checked before a query is built. A view
// or plan outside its list is refused rather than read as no filter.
function readListQuery(query) {
  return {
    view: readChoiceParameter(
      query,
      'view',
      Object.values(MEMBERSHIP_LIST_VIEWS),
      MEMBERSHIP_LIST_VIEWS.ACTIVE,
    ),
    plan: readChoiceParameter(query, 'plan', PAID_PLAN_KEYS, null),
    search: readSearch(query),
    pagination: readPagination(query),
  };
}

// A paid plan is in force while now is before an expiry that can be trusted,
// the same rule isExpiredPaidPlan states in code. Expiring soon is the part of
// those that ends within the notice. Expired is the other side: a membership on
// Gratuita that keeps the plan it ran out of.
//
// A plan filter names a different field on each side — the plan in force, or the
// plan that ran out — so it is applied to both and the union is what the list
// may draw from.
function viewFilters(now, noticeDays, freePlanId, planId) {
  const trusted = latestTrustedExpiry(now);
  const noticeEnd = new Date(
    Math.min(now.getTime() + noticeDays * DAY_IN_MILLISECONDS, trusted.getTime()),
  );
  const inForce = planId === null ? { plan: { $ne: freePlanId } } : { plan: planId };
  const lapsed = planId === null ? { 'lapsed.plan': { $ne: null } } : { 'lapsed.plan': planId };

  return {
    listed: { $or: [inForce, lapsed] },
    active: { ...inForce, expiresAt: { $gt: now, $lte: trusted } },
    expiring: { ...inForce, expiresAt: { $gt: now, $lte: noticeEnd } },
    expired: lapsed,
  };
}

// Matched on the business name anywhere in it, or on the start of the member
// code with its dashes ignored. The text is escaped, so a search is only ever
// read as the characters typed.
function searchFilter(search) {
  if (search === null) {
    return null;
  }

  const code = search.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const conditions = [{ 'member.businessName': { $regex: escapeForRegex(search), $options: 'i' } }];

  if (code !== '') {
    conditions.push({ 'member.memberCode': { $regex: `^${escapeForRegex(code)}` } });
  }

  return { $or: conditions };
}

// Soonest to expire first, so the plans to follow up on lead the two live views.
// An expired one sorts the other way round: the lapse nobody has dealt with yet
// is the most recent.
const ORDER = {
  [MEMBERSHIP_LIST_VIEWS.ACTIVE]: { expiresAt: 1, _id: 1 },
  [MEMBERSHIP_LIST_VIEWS.EXPIRING]: { expiresAt: 1, _id: 1 },
  [MEMBERSHIP_LIST_VIEWS.EXPIRED]: { 'lapsed.expiredAt': -1, _id: 1 },
};

function listPipeline({ filters, view, search, pagination }) {
  const matchSearch = searchFilter(search);

  return [
    { $match: filters.listed },
    {
      $lookup: {
        from: 'members',
        localField: 'member',
        foreignField: '_id',
        pipeline: [{ $project: { businessName: 1, memberCode: 1 } }],
        as: 'member',
      },
    },
    { $unwind: '$member' },
    ...(matchSearch === null ? [] : [{ $match: matchSearch }]),
    {
      $facet: {
        active: [{ $match: filters.active }, { $count: 'count' }],
        expiring: [{ $match: filters.expiring }, { $count: 'count' }],
        expired: [{ $match: filters.expired }, { $count: 'count' }],
        items: [
          { $match: filters[view] },
          { $sort: ORDER[view] },
          { $skip: pagination.skip },
          { $limit: pagination.pageSize },
        ],
      },
    },
  ];
}

const countOf = (bucket = []) => bucket[0]?.count ?? 0;

// An expired row is about the plan that ran out: the member is on Gratuita, and
// Gratuita never ends. That plan and its last day are what the chamber reads.
function presentItem(membership, plansById, view) {
  const lapsed = view === MEMBERSHIP_LIST_VIEWS.EXPIRED ? membership.lapsed : null;
  const plan = plansById.get(String(lapsed === null ? membership.plan : lapsed.plan));
  const expiresAt = lapsed === null ? membership.expiresAt : lapsed.expiredAt;

  return {
    memberId: String(membership.member._id),
    memberCode: formatMemberCode(membership.member.memberCode),
    businessName: membership.member.businessName,
    plan: plan === undefined ? null : { key: plan.key, name: plan.name },
    frequency: membership.frequency ?? null,
    lastPaymentAt: membership.lastPaymentAt ?? null,
    expiresAt,
    validUntil: lastValidDay(expiresAt),
  };
}

const defaultListStore = {
  findPlans: () => Plan.find().select('key name').lean(),
  readNoticeDays: () => membershipPolicyService.readNoticeDays(),
  aggregate: (pipeline) => Membership.aggregate(pipeline),
};

async function listMemberships(query, now, store = defaultListStore) {
  const { view, plan, search, pagination } = readListQuery(query);
  const [plans, noticeDays] = await Promise.all([store.findPlans(), store.readNoticeDays()]);
  const plansByKey = new Map(plans.map((item) => [item.key, item]));
  const plansById = new Map(plans.map((item) => [String(item._id), item]));
  const freePlan = plansByKey.get(PLAN_KEYS.FREE);

  if (freePlan === undefined) {
    throw new ApplicationError(ERROR_CODES.INTERNAL_ERROR, 'The plans have not been seeded.', {
      statusCode: 500,
    });
  }

  // A plan asked for but missing from the catalog matches nothing, rather than
  // falling back to every plan.
  const planId =
    plan === null ? null : (plansByKey.get(plan)?._id ?? new mongoose.Types.ObjectId());

  const filters = viewFilters(now, noticeDays, freePlan._id, planId);
  const [result] = await store.aggregate(listPipeline({ filters, view, search, pagination }));

  return {
    ...paginated(
      result.items.map((membership) => presentItem(membership, plansById, view)),
      countOf(result[view]),
      pagination,
    ),
    counts: {
      active: countOf(result.active),
      expiring: countOf(result.expiring),
      expired: countOf(result.expired),
    },
    noticeDays,
  };
}

module.exports = {
  MEMBERSHIP_LIST_VIEWS,
  readListQuery,
  viewFilters,
  searchFilter,
  listMemberships,
};
