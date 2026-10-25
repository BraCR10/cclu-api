const { Publication, PUBLICATION_STATUSES } = require('../models/Publication');
const { Membership } = require('../models/Membership');
const { Plan } = require('../models/Plan');
// Registered here because a publication's member populates its canton.
require('../models/Canton');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');

const MEMBER_FIELDS = 'businessName memberCode district logoUrl canton';
const CATEGORY_FIELDS = 'name';

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That publication no longer exists.', {
    statusCode: 404,
  });
}

// What a client sees of the business behind a publication: enough to know who
// sells and where, and nothing the chamber keeps to itself.
function presentBusiness(member) {
  if (member === null || member === undefined || typeof member !== 'object') {
    return null;
  }

  return {
    businessName: member.businessName,
    memberCode: member.memberCode ?? null,
    district: member.district ?? null,
    canton: member.canton?.name ?? null,
    logoUrl: member.logoUrl ?? null,
  };
}

function present(pub) {
  const category = typeof pub.category?.name === 'string' ? pub.category : null;

  return {
    id: String(pub._id),
    type: pub.type,
    title: pub.title,
    description: pub.description,
    price: pub.price ?? null,
    imageUrl: pub.imageUrl ?? null,
    category: category === null ? null : { _id: String(category._id), name: category.name },
    percentage: pub.percentage ?? null,
    condition: pub.condition ?? null,
    startsAt: pub.startsAt === null || pub.startsAt === undefined ? null : day(pub.startsAt),
    endsAt: pub.endsAt === null || pub.endsAt === undefined ? null : day(pub.endsAt),
    publishedAt: pub.publishedAt,
    business: presentBusiness(pub.member),
  };
}

function day(value) {
  return new Date(value).toISOString().slice(0, 10);
}

// What is on offer: published, not taken down, still inside its validity, and
// offered by a business that holds the plan publishing belongs to. A lapsed plan
// stops being a shop window the moment it lapses, without anyone deleting
// anything.
function visible(now) {
  return {
    status: PUBLICATION_STATUSES.ACTIVE,
    removedAt: null,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
}

async function membersWithShopWindow(now) {
  const plans = await Plan.find({ 'entitlements.publishInMarketplace': true }).select('_id').lean();

  if (plans.length === 0) {
    return [];
  }

  const memberships = await Membership.find({
    plan: { $in: plans.map((plan) => plan._id) },
    expiresAt: { $gt: now },
  })
    .select('member')
    .lean();

  return memberships.map((membership) => membership.member);
}

const defaultStore = {
  list: (filter, pagination) =>
    Publication.find(filter)
      .sort({ publishedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .populate('category', CATEGORY_FIELDS)
      .populate('member', MEMBER_FIELDS)
      .populate('member.canton', 'name')
      .lean(),
  count: (filter) => Publication.countDocuments(filter),
  find: (filter) =>
    Publication.findOne(filter)
      .populate('category', CATEGORY_FIELDS)
      .populate('member', MEMBER_FIELDS)
      .populate('member.canton', 'name')
      .lean(),
  shopWindows: (now) => membersWithShopWindow(now),
};

function readType(query) {
  const type = query.type;

  if (type === undefined || type === null || type === '') {
    return null;
  }

  if (type !== 'product' && type !== 'service' && type !== 'promotion' && type !== 'discount') {
    throw new ApplicationError(ERROR_CODES.NOT_ALLOWED, 'That is not a kind of publication.', {
      field: 'type',
    });
  }

  return type;
}

// The search is read as text, never as a pattern: a visitor typing a full stop
// searches for a full stop.
function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readMarketplace(query, now = new Date(), store = defaultStore) {
  const pagination = readPagination(query);
  const type = readType(query);
  const members = await store.shopWindows(now);
  const filter = { ...visible(now), member: { $in: members } };

  if (type !== null) {
    filter.type = type;
  }

  if (typeof query.category === 'string' && query.category !== '') {
    filter.category = query.category;
  }

  if (typeof query.search === 'string' && query.search.trim() !== '') {
    const term = escaped(query.search.trim());
    filter.$or = [
      { title: { $regex: term, $options: 'i' } },
      { description: { $regex: term, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([store.list(filter, pagination), store.count(filter)]);

  return paginated(items.map(present), total, pagination);
}

async function readMarketplaceItem(publicationId, now = new Date(), store = defaultStore) {
  const members = await store.shopWindows(now);
  const found = await store.find({
    ...visible(now),
    member: { $in: members },
    _id: publicationId,
  });

  if (found === null || found === undefined) {
    throw notFound();
  }

  return present(found);
}

// The panel's figure asks the marketplace's own question, so what it counts and
// what a visitor can find can never disagree.
async function countVisible(now = new Date(), store = defaultStore) {
  const members = await store.shopWindows(now);

  return store.count({ ...visible(now), member: { $in: members } });
}

module.exports = { readMarketplace, readMarketplaceItem, countVisible, present };
