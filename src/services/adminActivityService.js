const { Activity, ACTIVITY_STATUSES } = require('../models/Activity');
const { Member } = require('../models/Member');
const { ERROR_CODES } = require('../config/errorCodes');
const {
  readText,
  readChoice,
  ValidationError,
  refuse,
  PATTERNS,
} = require('../config/memberRules');
const { readSearch, escapeForRegex } = require('../config/listSearch');

const MANAGEABLE_STATUSES = [
  ACTIVITY_STATUSES.ACTIVE,
  ACTIVITY_STATUSES.PENDING,
  ACTIVITY_STATUSES.INACTIVE,
];

// The catalog is short enough to arrive whole, but the panel needs to know how
// many members each entry carries: that is what decides whether one may be
// removed at all.
function present(activity, members = 0) {
  return {
    id: String(activity._id),
    name: activity.name,
    status: activity.status,
    members,
  };
}

function readActivityId(value) {
  if (typeof value !== 'string' || !PATTERNS.objectId.test(value.trim())) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That activity does not exist.',
      404,
    );
  }

  return value.trim();
}

async function readName(body, store, currentId = null) {
  const name = readText(body, 'name', { required: true });
  // Two entries differing only in case would split the same trade in two, so the
  // comparison ignores case even though the stored name keeps it.
  const taken = await store.findByName(name);

  if (taken !== null && taken !== undefined && String(taken._id) !== currentId) {
    refuse(ERROR_CODES.ACTIVITY_ALREADY_LISTED, 'name', 'The catalog already has that activity.');
  }

  return name;
}

const defaultStore = {
  list: () => Activity.find({}).sort({ name: 1 }).lean(),
  counts: async () => {
    const rows = await Activity.aggregate([{ $group: { _id: '$status', total: { $sum: 1 } } }]);

    return rows.reduce((totals, row) => ({ ...totals, [row._id]: row.total }), {});
  },
  usage: async () => {
    const rows = await Member.aggregate([
      { $match: { activity: { $ne: null } } },
      { $group: { _id: '$activity', total: { $sum: 1 } } },
    ]);

    return new Map(rows.map((row) => [String(row._id), row.total]));
  },
  findById: (id) => Activity.findById(id).lean(),
  findByName: (name) =>
    Activity.findOne({ name: new RegExp(`^${escapeForRegex(name)}$`, 'i') }).lean(),
  create: (document) => Activity.create(document),
  update: (id, fields) =>
    Activity.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' }).lean(),
  remove: (id) => Activity.findByIdAndDelete(id).lean(),
  countMembers: (id) => Member.countDocuments({ activity: id }),
};

// Every entry, whatever its state, because the panel is where a pending one gets
// accepted and a retired one is still read by the members who carry it.
async function listActivities(query = {}, store = defaultStore) {
  const search = readSearch(query);
  const status =
    typeof query.status === 'string' && MANAGEABLE_STATUSES.includes(query.status.trim())
      ? query.status.trim()
      : undefined;

  const [all, counts, usage] = await Promise.all([store.list(), store.counts(), store.usage()]);
  const term = search === null ? undefined : search.toLocaleLowerCase('es');

  const items = all
    .filter((activity) => status === undefined || activity.status === status)
    .filter(
      (activity) => term === undefined || activity.name.toLocaleLowerCase('es').includes(term),
    )
    .map((activity) => present(activity, usage.get(String(activity._id)) ?? 0));

  return {
    items,
    counts: {
      active: counts[ACTIVITY_STATUSES.ACTIVE] ?? 0,
      pending: counts[ACTIVITY_STATUSES.PENDING] ?? 0,
      inactive: counts[ACTIVITY_STATUSES.INACTIVE] ?? 0,
    },
  };
}

async function createActivity(body, store = defaultStore) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const name = await readName(body, store);

  try {
    // Written active: the chamber typing an activity is the chamber accepting it.
    const created = await store.create({ name, status: ACTIVITY_STATUSES.ACTIVE });

    return present(created);
  } catch (error) {
    if (error.code === 11000) {
      refuse(ERROR_CODES.ACTIVITY_ALREADY_LISTED, 'name', 'The catalog already has that activity.');
    }

    throw error;
  }
}

// Renaming is safe because members point at the identifier, not the word. The
// status is how a pending one is accepted and an unwanted one retired.
async function updateActivity(activityId, body, store = defaultStore) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const id = readActivityId(activityId);
  const existing = await store.findById(id);

  if (existing === null || existing === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That activity does not exist.',
      404,
    );
  }

  const changes = {};

  if (body.name !== undefined) {
    const name = await readName(body, store, id);

    if (name !== existing.name) {
      changes.name = name;
    }
  }

  if (body.status !== undefined) {
    const status = readChoice(body, 'status', MANAGEABLE_STATUSES);

    if (status !== existing.status) {
      changes.status = status;
    }
  }

  if (Object.keys(changes).length === 0) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, null, 'Nothing in that request changes the activity.');
  }

  return present(await store.update(id, changes));
}

// An activity a member carries is retired, never deleted: their record would
// point at nothing. Only one nobody uses leaves the collection.
async function removeActivity(activityId, store = defaultStore) {
  const id = readActivityId(activityId);
  const existing = await store.findById(id);

  if (existing === null || existing === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That activity does not exist.',
      404,
    );
  }

  if ((await store.countMembers(id)) > 0) {
    refuse(
      ERROR_CODES.NOT_ALLOWED,
      null,
      'Members are classified under that activity; retire it instead of deleting it.',
    );
  }

  await store.remove(id);
}

module.exports = {
  listActivities,
  createActivity,
  updateActivity,
  removeActivity,
  present,
  MANAGEABLE_STATUSES,
};
