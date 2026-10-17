const mongoose = require('mongoose');
const { Membership } = require('../models/Membership');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { refuse } = require('../config/memberRules');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { lastValidDay, latestTrustedExpiry } = require('../config/chamberCalendar');
const { formatMemberCode } = require('./memberCodeService');
const membershipPolicyService = require('./membershipPolicyService');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAXIMUM_SEARCH_LENGTH = 100;

// A paid membership either still grants its plan or it does not. Expiring soon
// is a count over the active ones, not a third state.
const MEMBERSHIP_LIST_STATUSES = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

const PAID_PLAN_KEYS = [PLAN_KEYS.LITE, PLAN_KEYS.PRO, PLAN_KEYS.PREMIUM];

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeForRegex(text) {
  return text.replace(REGEX_SPECIALS, '\\$&');
}

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

function readSearch(query) {
  const raw = query?.search;

  if (raw === undefined) {
    return null;
  }

  if (typeof raw !== 'string') {
    refuse(ERROR_CODES.NOT_TEXT, 'search', 'The search is text.');
  }

  const text = raw.trim();

  if (text.length > MAXIMUM_SEARCH_LENGTH) {
    refuse(
      ERROR_CODES.TOO_LONG,
      'search',
      `The search is at most ${MAXIMUM_SEARCH_LENGTH} characters.`,
    );
  }

  return text === '' ? null : text;
}

// Everything the list is asked for is checked before a query is built. A
// status or plan outside its list is refused rather than read as no filter.
function readListQuery(query) {
  return {
    status: readChoiceParameter(
      query,
      'status',
      Object.values(MEMBERSHIP_LIST_STATUSES),
      MEMBERSHIP_LIST_STATUSES.ACTIVE,
    ),
    plan: readChoiceParameter(query, 'plan', PAID_PLAN_KEYS, null),
    search: readSearch(query),
    pagination: readPagination(query),
  };
}

// The filters that sort a paid membership into active or not. They state in a
// query what isExpiredPaidPlan states in code: a paid plan is active only
// while now is before an expiry that can be trusted. A member who lapsed to
// Gratuita stays listed as not active until they pay again.
function statusFilters(now, noticeDays, freePlanId, planId) {
  const trusted = latestTrustedExpiry(now);
  const noticeEnd = new Date(
    Math.min(now.getTime() + noticeDays * DAY_IN_MILLISECONDS, trusted.getTime()),
  );
  const paidPlan = planId === null ? { plan: { $ne: freePlanId } } : { plan: planId };
  const lapsedPlan = planId === null ? { 'lapsed.plan': { $ne: null } } : { 'lapsed.plan': planId };

  return {
    active: { ...paidPlan, expiresAt: { $gt: now, $lte: trusted } },
    expiring: { ...paidPlan, expiresAt: { $gt: now, $lte: noticeEnd } },
    inactive: {
      $or: [
        { plan: freePlanId, ...lapsedPlan },
        {
          ...paidPlan,
          $or: [{ expiresAt: { $lte: now } }, { expiresAt: null }, { expiresAt: { $gt: trusted } }],
        },
      ],
    },
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

const ACTIVE_ORDER = { expiresAt: 1, _id: 1 };
const INACTIVE_ORDER = { endedAt: -1, _id: 1 };

function listPipeline({ filters, status, search, pagination }) {
  const matchSearch = searchFilter(search);

  return [
    { $match: { $or: [filters.active, filters.inactive] } },
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
    { $addFields: { endedAt: { $ifNull: ['$lapsed.expiredAt', '$expiresAt'] } } },
    {
      $facet: {
        active: [{ $match: filters.active }, { $count: 'count' }],
        expiring: [{ $match: filters.expiring }, { $count: 'count' }],
        inactive: [{ $match: filters.inactive }, { $count: 'count' }],
        items: [
          { $match: filters[status] },
          { $sort: status === MEMBERSHIP_LIST_STATUSES.ACTIVE ? ACTIVE_ORDER : INACTIVE_ORDER },
          { $skip: pagination.skip },
          { $limit: pagination.pageSize },
        ],
      },
    },
  ];
}

const countOf = (bucket) => bucket[0]?.count ?? 0;

function presentItem(membership, status, plansById, now) {
  const isActive = status === MEMBERSHIP_LIST_STATUSES.ACTIVE;
  // A lapsed member is shown with the plan that ran out, not Gratuita: that is
  // what the chamber wants to win back.
  const shownPlanId = membership.lapsed?.plan ?? membership.plan;
  const plan = plansById.get(String(shownPlanId));
  const endedAt =
    membership.endedAt instanceof Date && membership.endedAt <= now ? membership.endedAt : null;
  const expiresAt = isActive ? membership.expiresAt : endedAt;

  return {
    memberId: String(membership.member._id),
    memberCode: formatMemberCode(membership.member.memberCode),
    businessName: membership.member.businessName,
    plan: plan === undefined ? null : { key: plan.key, name: plan.name },
    frequency: membership.frequency ?? null,
    lastPaymentAt: membership.lastPaymentAt ?? null,
    expiresAt,
    validUntil: expiresAt === null ? null : lastValidDay(expiresAt),
    status,
  };
}

const defaultListStore = {
  findPlans: () => Plan.find().select('key name').lean(),
  readNoticeDays: () => membershipPolicyService.readNoticeDays(),
  aggregate: (pipeline) => Membership.aggregate(pipeline),
};

async function listMemberships(query, now, store = defaultListStore) {
  const { status, plan, search, pagination } = readListQuery(query);
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

  const filters = statusFilters(now, noticeDays, freePlan._id, planId);
  const [result] = await store.aggregate(listPipeline({ filters, status, search, pagination }));
  const total = countOf(result[status]);

  return {
    ...paginated(
      result.items.map((membership) => presentItem(membership, status, plansById, now)),
      total,
      pagination,
    ),
    counts: {
      active: countOf(result.active),
      expiring: countOf(result.expiring),
      inactive: countOf(result.inactive),
    },
    noticeDays,
  };
}

module.exports = {
  MEMBERSHIP_LIST_STATUSES,
  readListQuery,
  statusFilters,
  searchFilter,
  listMemberships,
};
