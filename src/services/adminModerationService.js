const { Publication, PUBLICATION_TYPES, PUBLICATION_STATUSES } = require('../models/Publication');
const { Vacancy, VACANCY_STATUSES } = require('../models/Vacancy');
const { AUDIT_ACTIONS, AuditEntry } = require('../models/AuditEntry');
const { Admin } = require('../models/Admin');
const notificationService = require('./notificationService');
const { NOTIFICATION_TYPES } = require('../models/Notification');
const { readText, refuse, ValidationError } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { escapeForRegex, readSearch } = require('../config/listSearch');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const REASON_LENGTH = { MINIMUM: 10, MAXIMUM: 500 };

// The four things the chamber moderates, and the model each one lives in. A tab
// per type is what the panel draws, so the type is part of the address rather
// than a filter somebody can forget.
const KINDS = {
  products: {
    model: 'publication',
    type: PUBLICATION_TYPES.PRODUCT,
    label: 'Productos y servicios',
  },
  promotions: { model: 'publication', type: PUBLICATION_TYPES.PROMOTION, label: 'Promociones' },
  discounts: { model: 'publication', type: PUBLICATION_TYPES.DISCOUNT, label: 'Descuentos' },
  vacancies: { model: 'vacancy', type: null, label: 'Vacantes' },
};

const PUBLICATION_AVAILABLE = [PUBLICATION_STATUSES.ACTIVE, PUBLICATION_STATUSES.INACTIVE];

function readKind(value) {
  if (typeof value !== 'string' || KINDS[value] === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That is not moderated here.',
      404,
    );
  }

  return value;
}

function readContentId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That is not moderated here.',
      404,
    );
  }

  return value;
}

function readReason(body) {
  const reason = readText(body, 'reason', { required: true, maxLength: REASON_LENGTH.MAXIMUM });

  if (reason.length < REASON_LENGTH.MINIMUM) {
    refuse(
      ERROR_CODES.INVALID_FORMAT,
      'reason',
      `The reason is ${REASON_LENGTH.MINIMUM} to ${REASON_LENGTH.MAXIMUM} characters.`,
    );
  }

  return reason;
}

function presentPublication(row) {
  return {
    id: String(row._id),
    title: row.title,
    type: row.type,
    status: row.status,
    reason: row.inactiveReason ?? null,
    member: row.member?.businessName ?? row.member?.name ?? row.member?.email ?? null,
    memberId: row.member?._id === undefined ? null : String(row.member._id),
    publishedAt: row.publishedAt,
  };
}

function presentVacancy(row) {
  return {
    id: String(row._id),
    title: row.title,
    type: 'vacancy',
    status: row.status,
    reason: row.inactiveReason ?? null,
    member: row.member?.businessName ?? row.member?.name ?? row.member?.email ?? null,
    memberId: row.member?._id === undefined ? null : String(row.member._id),
    publishedAt: row.publishedAt,
  };
}

const MEMBER_FIELDS = 'businessName name email';

const defaultStore = {
  listPublications: (type, filter, { skip, pageSize }) =>
    Publication.find({ ...filter, type, removedAt: null })
      .populate('member', MEMBER_FIELDS)
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  countPublications: (type, filter) =>
    Publication.countDocuments({ ...filter, type, removedAt: null }),
  listVacancies: (filter, { skip, pageSize }) =>
    Vacancy.find({ ...filter, removedAt: null })
      .populate('member', MEMBER_FIELDS)
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  countVacancies: (filter) => Vacancy.countDocuments({ ...filter, removedAt: null }),
  findPublication: (id) => Publication.findById(id).populate('member', MEMBER_FIELDS).lean(),
  findVacancy: (id) => Vacancy.findById(id).populate('member', MEMBER_FIELDS).lean(),
  updatePublication: (id, changes) =>
    Publication.findByIdAndUpdate(id, { $set: changes }, { returnDocument: 'after' }).lean(),
  updateVacancy: (id, changes) =>
    Vacancy.findByIdAndUpdate(id, { $set: changes }, { returnDocument: 'after' }).lean(),
  writeAudit: (entry) => AuditEntry.create(entry),
  actorName: (id) => Admin.findById(id).select('name email').lean(),
};

function readStatusFilter(query, statuses) {
  const status = query?.status;

  if (status === undefined || status === null || status === '') {
    return {};
  }

  if (typeof status !== 'string' || !statuses.includes(status)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'status', 'That state does not exist.');
  }

  return { status };
}

function readSearchFilter(query) {
  const search = readSearch(query);

  if (search === null) {
    return {};
  }

  const pattern = new RegExp(escapeForRegex(search), 'i');

  return { $or: [{ title: pattern }, { description: pattern }] };
}

// What the chamber has to look at, by tab: the live content of a type, or what
// it already took down and may want to put back.
async function listContent(kindValue, query, store = defaultStore) {
  const kind = readKind(kindValue);
  const pagination = readPagination(query);
  const definition = KINDS[kind];
  const statuses =
    definition.model === 'publication' ? PUBLICATION_AVAILABLE : Object.values(VACANCY_STATUSES);
  const filter = { ...readStatusFilter(query, statuses), ...readSearchFilter(query) };
  const isPublication = definition.model === 'publication';

  const [rows, total] = await Promise.all([
    isPublication
      ? store.listPublications(definition.type, filter, pagination)
      : store.listVacancies(filter, pagination),
    isPublication ? store.countPublications(definition.type, filter) : store.countVacancies(filter),
  ]);

  return paginated(
    rows.map((row) => (isPublication ? presentPublication(row) : presentVacancy(row))),
    total,
    pagination,
  );
}

async function readOne(kind, contentId, store) {
  const definition = KINDS[kind];
  const row =
    definition.model === 'publication'
      ? await store.findPublication(contentId)
      : await store.findVacancy(contentId);

  if (row === null || row === undefined) {
    throw new ValidationError(ERROR_CODES.UNKNOWN_REFERENCE, null, 'That does not exist.', 404);
  }

  if (definition.model === 'publication' && row.type !== definition.type) {
    throw new ValidationError(ERROR_CODES.UNKNOWN_REFERENCE, null, 'That does not exist.', 404);
  }

  return row;
}

function notificationTypeOf(kind, action) {
  if (kind === 'vacancies') {
    return action === 'take-down'
      ? NOTIFICATION_TYPES.VACANCY_TAKEN_DOWN
      : NOTIFICATION_TYPES.VACANCY_RESTORED;
  }

  return action === 'take-down'
    ? NOTIFICATION_TYPES.PUBLICATION_TAKEN_DOWN
    : NOTIFICATION_TYPES.PUBLICATION_RESTORED;
}

async function actorLabel(identity, store) {
  const actor = await store.actorName(identity.id);

  return actor?.name ?? actor?.email ?? 'admin';
}

async function write(spec, store, identity, now) {
  const definition = KINDS[spec.kind];
  const before = await readOne(spec.kind, spec.contentId, store);
  const changes =
    spec.action === 'take-down'
      ? { status: 'inactive', inactiveReason: spec.reason }
      : { status: 'active', inactiveReason: null };

  const updated =
    definition.model === 'publication'
      ? await store.updatePublication(spec.contentId, changes)
      : await store.updateVacancy(spec.contentId, changes);

  await store.writeAudit({
    action: auditActionOf(spec.kind, spec.action),
    actor: { role: identity.role, name: await actorLabel(identity, store) },
    subject: {
      type: definition.model === 'publication' ? 'Publication' : 'Vacancy',
      id: before._id,
      label: before.title,
    },
    changes: [
      { field: 'status', before: before.status, after: changes.status },
      {
        field: 'inactiveReason',
        before: before.inactiveReason ?? null,
        after: changes.inactiveReason,
      },
    ],
    occurredAt: now,
  });

  // A notice accompanies the decision and never undoes it: the member is told
  // what happened and why, on the same channel as every other decision.
  void notificationService
    .notifyMember(before.member?._id ?? before.member, notificationTypeOf(spec.kind, spec.action), {
      title: before.title,
      reason: spec.reason ?? null,
    })
    .catch(() => {});

  return definition.model === 'publication' ? presentPublication(updated) : presentVacancy(updated);
}

function auditActionOf(kind, action) {
  if (kind === 'vacancies') {
    return action === 'take-down'
      ? AUDIT_ACTIONS.VACANCY_TAKEN_DOWN
      : AUDIT_ACTIONS.VACANCY_RESTORED;
  }

  return action === 'take-down'
    ? AUDIT_ACTIONS.PUBLICATION_TAKEN_DOWN
    : AUDIT_ACTIONS.PUBLICATION_RESTORED;
}

async function takeDown(
  identity,
  kindValue,
  contentId,
  body,
  store = defaultStore,
  now = new Date(),
) {
  const kind = readKind(kindValue);
  const reason = readReason(body);

  return write(
    { kind, contentId: readContentId(contentId), action: 'take-down', reason },
    store,
    identity,
    now,
  );
}

async function restore(identity, kindValue, contentId, store = defaultStore, now = new Date()) {
  const kind = readKind(kindValue);

  return write(
    { kind, contentId: readContentId(contentId), action: 'restore', reason: null },
    store,
    identity,
    now,
  );
}

module.exports = { listContent, takeDown, restore, KINDS };
