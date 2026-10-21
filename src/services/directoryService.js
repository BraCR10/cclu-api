const mongoose = require('mongoose');
const { Member, APPLICATION_STATUSES, BRANCH_MODALITIES } = require('../models/Member');
const { Branch } = require('../models/Branch');
const { Membership } = require('../models/Membership');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { refuse } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { escapeForRegex, readSearch } = require('../config/listSearch');
const { formatMemberCode, normalizeMemberCode } = require('./memberCodeService');
const { isExpiredPaidPlan } = require('./entitlementService');
const { PLAN_KEYS } = require('../models/Plan');

const DEFAULT_PAGE_SIZE = '12';
const MAXIMUM_DISTRICT_LENGTH = 80;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Spanish order, and a comparison that ignores case and accents, so "Tres
// Ríos" and "tres rios" are the same district and "Óptica" sorts under O.
const SPANISH = { locale: 'es', strength: 1 };

// The same rule that opens an account decides who is listed: approved, and not
// suspended. Anyone else has no public listing at all.
const LISTED = {
  applicationStatus: APPLICATION_STATUSES.APPROVED,
  accountStatus: { $ne: ACCOUNT_STATUSES.SUSPENDED },
};

function readReference(query, field) {
  const raw = query?.[field];

  if (raw === undefined || raw === '') {
    return null;
  }

  if (typeof raw !== 'string' || !OBJECT_ID.test(raw)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `${field} is a catalog identifier.`);
  }

  return new mongoose.Types.ObjectId(raw);
}

function readDistrict(query) {
  const raw = query?.district;

  if (raw === undefined || raw === '') {
    return null;
  }

  if (typeof raw !== 'string' || raw.trim().length > MAXIMUM_DISTRICT_LENGTH) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'district', 'district is the name of a district.');
  }

  return raw.trim() || null;
}

function readDirectoryQuery(query) {
  const canton = readReference(query, 'canton');
  const district = readDistrict(query);

  // A district is only a place inside a canton; two cantons share names.
  if (district !== null && canton === null) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'district', 'A district is filtered within a canton.');
  }

  return {
    search: readSearch(query),
    activity: readReference(query, 'activity'),
    canton,
    district,
    pagination: readPagination({ pageSize: DEFAULT_PAGE_SIZE, ...query }),
  };
}

// A search that reads as a card code finds that card; anything else is part of
// a business name.
function searchFilter(search) {
  if (search === null) {
    return {};
  }

  const code = normalizeMemberCode(search);

  return code === null
    ? { businessName: { $regex: escapeForRegex(search), $options: 'i' } }
    : { memberCode: code };
}

// A member whose record predates branches has none yet, and is placed by the
// canton and district on the registration instead.
function placeFilter(canton, district) {
  if (canton === null) {
    return null;
  }

  const place = district === null ? { canton } : { canton, district };

  return {
    $or: [{ branches: { $elemMatch: place } }, { branches: { $size: 0 }, ...place }],
  };
}

function listPipeline({ search, activity, canton, district, pagination, memberIds = null }) {
  const place = placeFilter(canton, district);

  return [
    {
      $match: {
        ...LISTED,
        ...searchFilter(search),
        ...(activity === null ? {} : { activity }),
        ...(memberIds === null ? {} : { _id: { $in: memberIds } }),
      },
    },
    {
      $lookup: {
        from: 'branches',
        localField: '_id',
        foreignField: 'member',
        pipeline: [
          { $match: { removedAt: null } },
          { $sort: { isPrimary: -1, createdAt: 1 } },
          { $project: { name: 1, canton: 1, district: 1 } },
        ],
        as: 'branches',
      },
    },
    ...(place === null ? [] : [{ $match: place }]),
    {
      $facet: {
        items: [
          { $sort: { businessName: 1, _id: 1 } },
          { $skip: pagination.skip },
          { $limit: pagination.pageSize },
          {
            $lookup: {
              from: 'activities',
              localField: 'activity',
              foreignField: '_id',
              as: 'activity',
            },
          },
          { $lookup: { from: 'cantons', localField: 'canton', foreignField: '_id', as: 'canton' } },
          {
            $project: {
              memberCode: 1,
              businessName: 1,
              activityOther: 1,
              logoFileKey: 1,
              branchModality: 1,
              branchName: 1,
              district: 1,
              branches: 1,
              activity: { $first: '$activity.name' },
              cantonName: { $first: '$canton.name' },
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];
}

// The paid plan a member holds right now, or null on Gratuita. A paid plan that
// has run out shows nothing, even before the hourly run moves the record.
function paidPlanOf(membership, now) {
  if (membership === undefined || membership.plan === null) {
    return null;
  }

  if (membership.plan.key === PLAN_KEYS.FREE || isExpiredPaidPlan(membership, now)) {
    return null;
  }

  return { key: membership.plan.key, name: membership.plan.name };
}

function firstPlace(member) {
  const [first] = member.branches;

  if (first !== undefined) {
    return { name: first.name, district: first.district };
  }

  if (member.branchModality === BRANCH_MODALITIES.VIRTUAL || !member.branchName) {
    return null;
  }

  return { name: member.branchName, district: member.district ?? null };
}

function presentListing(member, membership, now) {
  return {
    memberCode: formatMemberCode(member.memberCode),
    businessName: member.businessName,
    activity: member.activity ?? member.activityOther ?? null,
    logoFileKey: member.logoFileKey ?? null,
    plan: paidPlanOf(membership, now),
    branch: firstPlace(member),
    otherBranches: Math.max(member.branches.length - 1, 0),
    online: member.branches.length === 0 && member.branchModality === BRANCH_MODALITIES.VIRTUAL,
  };
}

const defaultDirectoryStore = {
  aggregate: (pipeline) => Member.aggregate(pipeline).collation(SPANISH),
  findMemberships: (memberIds) =>
    Membership.find({ member: { $in: memberIds } })
      .populate('plan', 'key name')
      .lean(),
};

async function listDirectory(query, now, store = defaultDirectoryStore) {
  const directoryQuery = readDirectoryQuery(query);
  const [result] = await store.aggregate(listPipeline(directoryQuery));
  const memberships = await store.findMemberships(result.items.map((member) => member._id));
  const membershipByMember = new Map(
    memberships.map((membership) => [String(membership.member), membership]),
  );

  return paginated(
    result.items.map((member) =>
      presentListing(member, membershipByMember.get(String(member._id)), now),
    ),
    result.total[0]?.count ?? 0,
    directoryQuery.pagination,
  );
}

// Premium shows first, then Pro, then Lite: the visibility is what the higher
// plans sell. Within a plan, the most recent payment comes first.
const FEATURED_LIMIT = 8;
const FEATURED_RANK = { [PLAN_KEYS.PREMIUM]: 0, [PLAN_KEYS.PRO]: 1, [PLAN_KEYS.LITE]: 2 };

function featuredOrder(memberships, now) {
  return memberships
    .filter((membership) => paidPlanOf(membership, now) !== null)
    .sort(
      (first, second) =>
        FEATURED_RANK[first.plan.key] - FEATURED_RANK[second.plan.key] ||
        new Date(second.startedAt ?? 0) - new Date(first.startedAt ?? 0),
    );
}

const defaultFeaturedStore = {
  ...defaultDirectoryStore,
  findPaidMemberships: () =>
    Membership.find({ expiresAt: { $ne: null } })
      .populate('plan', 'key name')
      .lean(),
  countListed: () => Member.countDocuments(LISTED),
};

// The businesses the home page puts first: those on a paid plan in force. A
// suspended or unlisted member drops out the same way it does from the list.
async function listFeatured(now, store = defaultFeaturedStore) {
  const ordered = featuredOrder(await store.findPaidMemberships(), now).slice(
    0,
    FEATURED_LIMIT * 2,
  );
  const membershipByMember = new Map(
    ordered.map((membership) => [String(membership.member), membership]),
  );
  const [result] = await store.aggregate(
    listPipeline({
      search: null,
      activity: null,
      canton: null,
      district: null,
      memberIds: ordered.map((membership) => membership.member),
      pagination: { skip: 0, pageSize: FEATURED_LIMIT * 2 },
    }),
  );
  const position = new Map(ordered.map((membership, index) => [String(membership.member), index]));

  return result.items
    .sort((first, second) => position.get(String(first._id)) - position.get(String(second._id)))
    .slice(0, FEATURED_LIMIT)
    .map((member) => presentListing(member, membershipByMember.get(String(member._id)), now));
}

async function countListed(store = defaultFeaturedStore) {
  return store.countListed();
}

const defaultDistrictStore = {
  findListedMemberIds: () => Member.distinct('_id', LISTED),
  branchDistricts: (canton, memberIds) =>
    Branch.distinct('district', { canton, removedAt: null, member: { $in: memberIds } }),
  memberDistricts: (canton, memberIds) =>
    Member.distinct('district', { canton, _id: { $in: memberIds } }),
};

const SPANISH_ORDER = new Intl.Collator('es', { sensitivity: 'base' });

// The districts a visitor can filter by: those where a listed business is, as
// the businesses wrote them. The registration takes the district as text, so
// the same district written twice with a different accent is offered once.
async function listDistricts(query, store = defaultDistrictStore) {
  const canton = readReference(query, 'canton');

  if (canton === null) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'canton', 'The districts are listed for a canton.');
  }

  const memberIds = await store.findListedMemberIds();
  const names = [
    ...(await store.branchDistricts(canton, memberIds)),
    ...(await store.memberDistricts(canton, memberIds)),
  ];
  const unique = [];

  for (const name of names.map((value) => value.trim()).filter((value) => value !== '')) {
    if (!unique.some((kept) => SPANISH_ORDER.compare(kept, name) === 0)) {
      unique.push(name);
    }
  }

  return { districts: unique.sort(SPANISH_ORDER.compare) };
}

module.exports = {
  readDirectoryQuery,
  listPipeline,
  presentListing,
  listDirectory,
  listDistricts,
  featuredOrder,
  listFeatured,
  countListed,
};
