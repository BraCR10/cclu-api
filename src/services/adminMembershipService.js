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

// The list shows paid plans in force and nothing else. A plan that ran out is
// back on Gratuita, which is not listed, so there is no state to show: the
// chamber sees every active membership, or only those expiring within the
// notice.
const MEMBERSHIP_LIST_VIEWS = Object.freeze({ ACTIVE: 'active', EXPIRING: 'expiring' });

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
// those that ends within the notice.
function viewFilters(now, noticeDays, freePlanId, planId) {
  const trusted = latestTrustedExpiry(now);
  const noticeEnd = new Date(
    Math.min(now.getTime() + noticeDays * DAY_IN_MILLISECONDS, trusted.getTime()),
  );
  const paidPlan = planId === null ? { plan: { $ne: freePlanId } } : { plan: planId };

  return {
    active: { ...paidPlan, expiresAt: { $gt: now, $lte: trusted } },
    expiring: { ...paidPlan, expiresAt: { $gt: now, $lte: noticeEnd } },
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

// Soonest to expire first, so the plans to follow up on lead either view.
const ORDER = { expiresAt: 1, _id: 1 };

function listPipeline({ filters, view, search, pagination }) {
  const matchSearch = searchFilter(search);

  return [
    { $match: filters.active },
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
        active: [{ $count: 'count' }],
        expiring: [{ $match: filters.expiring }, { $count: 'count' }],
        items: [
          { $match: filters[view] },
          { $sort: ORDER },
          { $skip: pagination.skip },
          { $limit: pagination.pageSize },
        ],
      },
    },
  ];
}

const countOf = (bucket) => bucket[0]?.count ?? 0;

function presentItem(membership, plansById) {
  const plan = plansById.get(String(membership.plan));

  return {
    memberId: String(membership.member._id),
    memberCode: formatMemberCode(membership.member.memberCode),
    businessName: membership.member.businessName,
    plan: plan === undefined ? null : { key: plan.key, name: plan.name },
    frequency: membership.frequency ?? null,
    lastPaymentAt: membership.lastPaymentAt ?? null,
    expiresAt: membership.expiresAt,
    validUntil: lastValidDay(membership.expiresAt),
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
      result.items.map((membership) => presentItem(membership, plansById)),
      countOf(result[view]),
      pagination,
    ),
    counts: { active: countOf(result.active), expiring: countOf(result.expiring) },
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
