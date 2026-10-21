const { Member, SHOP_DAYS } = require('../models/Member');
const { Activity } = require('../models/Activity');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readText, refuse, PATTERNS } = require('../config/memberRules');

const STORE_FIELDS =
  'businessDescription storeCategories instagram facebook linkedin website storeSchedule';
const OPTIONAL_TEXT_FIELDS = ['instagram', 'facebook', 'linkedin', 'website'];
const TIME_SHAPE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAXIMUM_CATEGORIES = 5;

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That account no longer exists.', {
    statusCode: 404,
  });
}

function readTime(entry, field) {
  const value = entry[field];

  if (typeof value !== 'string' || !TIME_SHAPE.test(value.trim())) {
    refuse(
      ERROR_CODES.INVALID_FORMAT,
      'schedule',
      `The field ${field} must be a time of day, as HH:MM.`,
    );
  }

  return value.trim();
}

// The schedule is the week, not a list of exceptions: a day the body leaves out
// is a day the shop is closed, which is what an absent week means as well.
function readSchedule(value) {
  if (!Array.isArray(value)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'schedule', 'The schedule must be a list of days.');
  }

  const byDay = new Map();

  for (const entry of value) {
    const day = entry === null || typeof entry !== 'object' ? null : entry.day;

    if (!SHOP_DAYS.includes(day)) {
      refuse(ERROR_CODES.NOT_ALLOWED, 'schedule', 'The schedule names a day that does not exist.');
    }

    if (byDay.has(day)) {
      refuse(ERROR_CODES.NOT_ALLOWED, 'schedule', 'The schedule names a day twice.');
    }

    if (entry.closed === true) {
      byDay.set(day, { day, closed: true });
      continue;
    }

    const opensAt = readTime(entry, 'opensAt');
    const closesAt = readTime(entry, 'closesAt');

    // A shop that opens at six in the evening and closes at eight in the morning
    // is a night shift, and nothing here says which day it ends on.
    if (opensAt >= closesAt) {
      refuse(ERROR_CODES.INVALID_FORMAT, 'schedule', 'A day must close after it opens.');
    }

    byDay.set(day, { day, closed: false, opensAt, closesAt });
  }

  return SHOP_DAYS.map((day) => byDay.get(day) ?? { day, closed: true });
}

async function readCategories(value, findCategories) {
  if (!Array.isArray(value)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'categories', 'The categories must be a list.');
  }

  const ids = value.map((id) => (typeof id === 'string' ? id.trim() : id));

  if (ids.some((id) => typeof id !== 'string' || !PATTERNS.objectId.test(id))) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'categories', 'Every category must be a reference.');
  }

  const unique = [...new Set(ids)];

  if (unique.length > MAXIMUM_CATEGORIES) {
    refuse(
      ERROR_CODES.NOT_ALLOWED,
      'categories',
      `A shop is grouped under ${MAXIMUM_CATEGORIES} categories at most.`,
    );
  }

  const found = await findCategories(unique);

  if (found.length !== unique.length) {
    refuse(
      ERROR_CODES.UNKNOWN_REFERENCE,
      'categories',
      'The categories name something that does not exist.',
    );
  }

  return found.map((category) => category._id);
}

function presentDay(stored) {
  return stored.closed === true
    ? { day: stored.day, closed: true }
    : {
        day: stored.day,
        closed: false,
        opensAt: stored.opensAt ?? null,
        closesAt: stored.closesAt ?? null,
      };
}

function present(member) {
  const categories = Array.isArray(member.storeCategories) ? member.storeCategories : [];
  const stored = Array.isArray(member.storeSchedule) ? member.storeSchedule : [];
  const byDay = new Map(stored.map((entry) => [entry.day, entry]));

  return {
    businessDescription: member.businessDescription ?? null,
    categories: categories
      .filter((category) => category !== null && typeof category === 'object')
      .map((category) => ({ _id: String(category._id), name: category.name })),
    instagram: member.instagram ?? null,
    facebook: member.facebook ?? null,
    linkedin: member.linkedin ?? null,
    website: member.website ?? null,
    schedule: SHOP_DAYS.map((day) => presentDay(byDay.get(day) ?? { day, closed: true })),
  };
}

const defaultStore = {
  find: (memberId) =>
    Member.findById(memberId).select(STORE_FIELDS).populate('storeCategories', 'name').lean(),
  update: (memberId, update) =>
    Member.findByIdAndUpdate(memberId, update, { returnDocument: 'after' })
      .select(STORE_FIELDS)
      .populate('storeCategories', 'name')
      .lean(),
  findCategories: (ids) =>
    Activity.find({ _id: { $in: ids } })
      .select('_id')
      .lean(),
};

async function readOwnStore(memberId, store = defaultStore) {
  const member = await store.find(memberId);

  if (member === null || member === undefined) {
    throw notFound();
  }

  return present(member);
}

async function updateOwnStore(memberId, body, store = defaultStore) {
  const changes = {};
  const unset = {};

  if ('businessDescription' in body) {
    changes.businessDescription = readText(body, 'businessDescription', { required: true });
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (!(field in body)) {
      continue;
    }

    const value = readText(body, field, { required: false });

    if (value === undefined) {
      unset[field] = '';
    } else {
      changes[field] = value;
    }
  }

  if ('categories' in body) {
    changes.storeCategories = await readCategories(body.categories, store.findCategories);
  }

  if ('schedule' in body) {
    changes.storeSchedule = readSchedule(body.schedule);
  }

  if (Object.keys(changes).length === 0 && Object.keys(unset).length === 0) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
  }

  const update = { $set: changes };

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  const updated = await store.update(memberId, update);

  if (updated === null || updated === undefined) {
    throw notFound();
  }

  return present(updated);
}

module.exports = { readOwnStore, updateOwnStore, presentStore: present, MAXIMUM_CATEGORIES };
