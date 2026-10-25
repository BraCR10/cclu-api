const { Publication, PUBLICATION_TYPES, PUBLICATION_STATUSES } = require('../models/Publication');
const { Activity } = require('../models/Activity');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const {
  readText,
  readChoice,
  readReference,
  readCalendarDate,
  refuse,
  PATTERNS,
} = require('../config/memberRules');
const { readPagination, paginated } = require('../config/pagination');
const { grants, readEffectivePlan } = require('./entitlementService');

const ENTITLEMENT = 'publishInMarketplace';
const PRICED = [PUBLICATION_TYPES.PRODUCT, PUBLICATION_TYPES.SERVICE];
const TIMED = [PUBLICATION_TYPES.PROMOTION, PUBLICATION_TYPES.DISCOUNT];
const MAXIMUM_PERCENTAGE = 90;

const CATEGORY_FIELDS = 'name';

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That publication no longer exists.', {
    statusCode: 404,
  });
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
    // Calendar days: a promotion runs on days, not on instants, so no time zone
    // can make it start or end a day early.
    startsAt: pub.startsAt === null || pub.startsAt === undefined ? null : toDay(pub.startsAt),
    endsAt: pub.endsAt === null || pub.endsAt === undefined ? null : toDay(pub.endsAt),
    status: pub.status,
    inactiveReason: pub.inactiveReason ?? null,
    publishedAt: pub.publishedAt,
    // What the member's table sorts and dates a row by: the last time it was
    // touched, not the day it went up.
    updatedAt: pub.updatedAt ?? pub.publishedAt,
  };
}

function toDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function readPrice(body) {
  const value = body.price;

  // The prototype leaves it optional: a shop that has not priced something yet
  // says "Consultar precio" rather than being kept out of the marketplace.
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const price = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(price) || price < 0) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'price', 'The price must be a number of colones.');
  }

  return Math.round(price);
}

function readPercentage(body) {
  const value = body.percentage;

  if (value === undefined || value === null || value === '') {
    refuse(ERROR_CODES.REQUIRED, 'percentage', 'The field percentage is required.');
  }

  const percentage = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(percentage) || percentage < 1 || percentage > MAXIMUM_PERCENTAGE) {
    refuse(
      ERROR_CODES.INVALID_FORMAT,
      'percentage',
      `The percentage is a whole number from 1 to ${MAXIMUM_PERCENTAGE}.`,
    );
  }

  return percentage;
}

// What the type needs and the others do not: the body is read once the type is
// known, so a promotion is never refused for a missing price.
function readValidity(body) {
  const startsAt = readCalendarDate(body, 'startsAt', { required: true });
  const endsAt = readCalendarDate(body, 'endsAt', { required: true });

  // A promotion that ends before it starts is a typo, and the API says which of
  // the two days is wrong.
  if (endsAt <= startsAt) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'endsAt', 'The validity must end after it starts.');
  }

  return { startsAt, endsAt };
}

async function readFields(body, type) {
  const fields = {
    type,
    title: readText(body, 'title', { required: true }),
    description: readText(body, 'description', { required: true }),
  };

  if (PRICED.includes(type)) {
    fields.price = readPrice(body);
    fields.imageUrl = readText(body, 'imageUrl', { required: false });
  }

  if (type === PUBLICATION_TYPES.DISCOUNT) {
    fields.percentage = readPercentage(body);
    fields.condition = readText(body, 'condition', { required: true });
  }

  if (TIMED.includes(type)) {
    Object.assign(fields, readValidity(body));
  }

  if ('category' in body) {
    fields.category = await readReference(body, 'category', Activity, { required: false });
  }

  return fields;
}

const OWN = (memberId) => ({ member: memberId, removedAt: null });

const defaultStore = {
  list: (memberId, pagination, type) =>
    Publication.find({ ...OWN(memberId), ...(type === null ? {} : { type }) })
      .sort({ publishedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.pageSize)
      .populate('category', CATEGORY_FIELDS)
      .lean(),
  count: (memberId, type) =>
    Publication.countDocuments({ ...OWN(memberId), ...(type === null ? {} : { type }) }),
  find: (memberId, publicationId) =>
    Publication.findOne({ _id: publicationId, ...OWN(memberId) })
      .populate('category', CATEGORY_FIELDS)
      .lean(),
  create: async (fields) => (await Publication.create(fields)).toObject(),
  update: (publicationId, update) =>
    Publication.findByIdAndUpdate(publicationId, update, { returnDocument: 'after' })
      .populate('category', CATEGORY_FIELDS)
      .lean(),
  remove: (memberId, publicationId, now) =>
    Publication.updateOne({ _id: publicationId, ...OWN(memberId) }, { $set: { removedAt: now } }),
  readPlan: (memberId, now) => readEffectivePlan(memberId, now),
};

function readTypeFilter(query) {
  const type = query.type;

  if (type === undefined || type === null || type === '') {
    return null;
  }

  if (!Object.values(PUBLICATION_TYPES).includes(type)) {
    refuse(ERROR_CODES.NOT_ALLOWED, 'type', 'That is not a kind of publication.');
  }

  return type;
}

// The member's own publications, and whether their plan lets them publish one
// now, so the screen offers the form or explains what unlocks it.
async function listOwnPublications(memberId, query, now, store = defaultStore) {
  const pagination = readPagination(query);
  const type = readTypeFilter(query);
  const [items, total, plan] = await Promise.all([
    store.list(memberId, pagination, type),
    store.count(memberId, type),
    store.readPlan(memberId, now),
  ]);

  return {
    ...paginated(items.map(present), total, pagination),
    canPublish: grants(plan, ENTITLEMENT),
  };
}

async function createPublication(memberId, body, now, store = defaultStore) {
  const type = readChoice(body, 'type', Object.values(PUBLICATION_TYPES));
  const fields = await readFields(body, type);
  const created = await store.create({ ...fields, member: memberId, publishedAt: now });

  return present((await store.find(memberId, created._id)) ?? created);
}

// The edit screen opens on what is stored, so a refused field has something to
// point at. It reads the member's own publication only.
async function readOwnPublication(memberId, publicationId, store = defaultStore) {
  if (typeof publicationId !== 'string' || !PATTERNS.objectId.test(publicationId)) {
    throw notFound();
  }

  const found = await store.find(memberId, publicationId);

  if (found === null || found === undefined) {
    throw notFound();
  }

  return present(found);
}

// An edit keeps the type: a product does not become a promotion, because the two
// ask for different things and what was written would be half lost.
async function updatePublication(memberId, publicationId, body, store = defaultStore) {
  if (typeof publicationId !== 'string' || !PATTERNS.objectId.test(publicationId)) {
    throw notFound();
  }

  const current = await store.find(memberId, publicationId);

  if (current === null || current === undefined) {
    throw notFound();
  }

  const fields = await readFields(body, current.type);
  const updated = await store.update(publicationId, { $set: fields });

  return present(updated);
}

// Taking one down and putting it back is the member's; the chamber's refusal is
// not theirs to undo, so a publication it took down says why and stays down.
async function setPublicationStatus(memberId, publicationId, body, store = defaultStore) {
  if (typeof publicationId !== 'string' || !PATTERNS.objectId.test(publicationId)) {
    throw notFound();
  }

  const current = await store.find(memberId, publicationId);

  if (current === null || current === undefined) {
    throw notFound();
  }

  const status = readChoice(body, 'status', Object.values(PUBLICATION_STATUSES));

  if (status === PUBLICATION_STATUSES.ACTIVE && current.inactiveReason !== null) {
    refuse(
      ERROR_CODES.NOT_ALLOWED,
      'status',
      'The chamber took this publication down, so only the chamber can put it back.',
    );
  }

  const updated = await store.update(publicationId, {
    $set: {
      status,
      inactiveReason: status === PUBLICATION_STATUSES.ACTIVE ? null : current.inactiveReason,
    },
  });

  return present(updated);
}

async function deleteOwnPublication(memberId, publicationId, now, store = defaultStore) {
  if (typeof publicationId !== 'string' || !PATTERNS.objectId.test(publicationId)) {
    throw notFound();
  }

  const { matchedCount } = await store.remove(memberId, publicationId, now);

  if (matchedCount === 0) {
    throw notFound();
  }
}

module.exports = {
  listOwnPublications,
  readOwnPublication,
  createPublication,
  updatePublication,
  setPublicationStatus,
  deleteOwnPublication,
  present,
  ENTITLEMENT,
};
