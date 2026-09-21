const { ValidationError, refuse, CODES, PATTERNS } = require('../config/memberRules');
const { readRequiredText, requireBody } = require('../config/postingFields');
const { ADMIN_STATUSES } = require('../config/adminStatus');
const {
  BUSINESS_POPULATE,
  presentBusiness,
  isOwnerVisible,
  findVisibleOwnerIds,
  readPage,
  readLimit,
  textFilter,
} = require('./publicationAccessService');

// A promotion and a discount are the same machine with different fields: text
// somebody publishes, a validity date that expires on its own, an owner switch
// and the chamber's say. Built once here; each module binds its own model.

function startOfToday(now = () => new Date()) {
  const today = new Date(now());
  today.setHours(0, 0, 0, 0);

  return today;
}

function readValidUntil(body, now) {
  const value = body.validUntil;
  const validUntil = typeof value === 'string' || value instanceof Date ? new Date(value) : null;

  if (validUntil === null || Number.isNaN(validUntil.getTime())) {
    refuse(CODES.INVALID_FORMAT, 'validUntil', 'The field validUntil is not a valid date.');
  }

  // A publication born expired is a mistake, not a publication.
  if (validUntil.getTime() < startOfToday(now).getTime()) {
    refuse(CODES.INVALID_FORMAT, 'validUntil', 'The field validUntil is already in the past.');
  }

  return validUntil;
}

function buildTimedPublicationService({ Model, kindName, textFields, searchField }) {
  const OWN_FIELDS = [
    'member',
    ...Object.keys(textFields),
    'validUntil',
    'isActive',
    'adminStatus',
    'createdAt',
  ].join(' ');

  function notFound() {
    return new ValidationError(
      CODES.UNKNOWN_REFERENCE,
      null,
      `That ${kindName} no longer exists.`,
      404,
    );
  }

  function notOwner() {
    return new ValidationError(
      CODES.NOT_ALLOWED,
      null,
      `This ${kindName} belongs to another member.`,
      403,
    );
  }

  function blocked() {
    return new ValidationError(
      CODES.BLOCKED_PUBLICATION,
      null,
      `This ${kindName} was blocked by the chamber and cannot be changed.`,
      403,
    );
  }

  function presentPublic(document) {
    const shape = { id: String(document._id) };

    for (const field of Object.keys(textFields)) {
      shape[field] = document[field];
    }

    shape.validUntil = document.validUntil;
    shape.createdAt = document.createdAt;
    shape.business = presentBusiness(document.member);

    return shape;
  }

  function presentOwn(document, now = () => new Date()) {
    const shape = { id: String(document._id) };

    for (const field of Object.keys(textFields)) {
      shape[field] = document[field];
    }

    shape.validUntil = document.validUntil;
    shape.createdAt = document.createdAt;
    shape.isActive = document.isActive;
    shape.adminStatus = document.adminStatus;
    shape.expired = document.validUntil.getTime() < startOfToday(now).getTime();

    return shape;
  }

  function findPublic(filter, skip, limit) {
    return Model.find(filter)
      .select(OWN_FIELDS)
      .populate(BUSINESS_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  function countPublic(filter) {
    return Model.countDocuments(filter);
  }

  async function listPublic(
    query,
    findOwners = findVisibleOwnerIds,
    find = findPublic,
    count = countPublic,
    now = () => new Date(),
  ) {
    const page = readPage(query?.page);
    const limit = readLimit(query?.limit);

    const owners = await findOwners({ canton: query?.canton, sector: query?.sector }, now);
    const filter = {
      member: { $in: owners },
      isActive: true,
      adminStatus: ADMIN_STATUSES.ACTIVE,
      validUntil: { $gte: startOfToday(now) },
    };

    const name = textFilter(query?.name);

    if (name !== undefined) {
      filter[searchField] = name;
    }

    const skip = (page - 1) * limit;
    const [documents, total] = await Promise.all([find(filter, skip, limit), count(filter)]);

    return {
      items: documents.map(presentPublic),
      total,
      page,
      limit,
      hasMore: skip + documents.length < total,
    };
  }

  function findPublicById(id) {
    return Model.findById(id).select(OWN_FIELDS).populate(BUSINESS_POPULATE).lean();
  }

  async function getPublicById(id, find = findPublicById, now = () => new Date()) {
    if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
      throw notFound();
    }

    const document = await find(id);

    const visible =
      document !== null &&
      document !== undefined &&
      document.isActive === true &&
      document.adminStatus === ADMIN_STATUSES.ACTIVE &&
      document.validUntil.getTime() >= startOfToday(now).getTime() &&
      isOwnerVisible(document.member, now);

    if (!visible) {
      throw notFound();
    }

    return presentPublic(document);
  }

  function findOwn(memberId) {
    return Model.find({ member: memberId }).select(OWN_FIELDS).sort({ createdAt: -1 }).lean();
  }

  async function listOwn(memberId, find = findOwn, now = () => new Date()) {
    const documents = await find(memberId);

    return documents.map((document) => presentOwn(document, now));
  }

  function save(fields) {
    return Model.create(fields).then((created) => created.toObject());
  }

  async function create(memberId, rawBody, persist = save, now = () => new Date()) {
    const body = requireBody(rawBody);
    const fields = { member: memberId };

    for (const [field, maximum] of Object.entries(textFields)) {
      fields[field] = readRequiredText(body, field, maximum);
    }

    fields.validUntil = readValidUntil(body, now);

    return presentOwn(await persist(fields), now);
  }

  function findForOwner(id) {
    return Model.findById(id).select(OWN_FIELDS).lean();
  }

  async function requireOwned(id, memberId, find) {
    if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
      throw notFound();
    }

    const document = await find(id);

    if (document === null || document === undefined) {
      throw notFound();
    }

    if (String(document.member) !== String(memberId)) {
      throw notOwner();
    }

    if (document.adminStatus === ADMIN_STATUSES.BLOCKED) {
      throw blocked();
    }

    return document;
  }

  function buildChanges(rawBody, existing, now) {
    const body = requireBody(rawBody);
    const changes = {};

    for (const [field, maximum] of Object.entries(textFields)) {
      if (field in body) {
        changes[field] = readRequiredText(body, field, maximum);
      }
    }

    if ('validUntil' in body) {
      changes.validUntil = readValidUntil(body, now);
    }

    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') {
        refuse(CODES.NOT_TEXT, 'isActive', 'The field isActive must be true or false.');
      }

      changes.isActive = body.isActive;
    }

    // Turning an expired publication back on without a new validity would show
    // the public something that is already over.
    const reactivating = changes.isActive === true;
    const validityAfter = changes.validUntil ?? existing.validUntil;

    if (reactivating && validityAfter.getTime() < startOfToday(now).getTime()) {
      refuse(
        CODES.EXPIRED_NEEDS_NEW_VALIDITY,
        'validUntil',
        'Reactivating requires a new validity date.',
      );
    }

    if (Object.keys(changes).length === 0) {
      refuse(CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
    }

    return changes;
  }

  function applyChanges(id, changes) {
    return Model.findByIdAndUpdate(
      id,
      { $set: changes },
      { returnDocument: 'after', runValidators: true },
    )
      .select(OWN_FIELDS)
      .lean();
  }

  async function update(
    id,
    memberId,
    rawBody,
    find = findForOwner,
    apply = applyChanges,
    now = () => new Date(),
  ) {
    const existing = await requireOwned(id, memberId, find);
    const changes = buildChanges(rawBody, existing, now);

    return presentOwn(await apply(id, changes), now);
  }

  // Closing turns the publication off rather than removing the record:
  // published content is kept permanently under BD-003.
  async function close(
    id,
    memberId,
    find = findForOwner,
    apply = (documentId) => Model.findByIdAndUpdate(documentId, { $set: { isActive: false } }),
  ) {
    await requireOwned(id, memberId, find);
    await apply(id);
  }

  return { listPublic, getPublicById, listOwn, create, update, close };
}

module.exports = { buildTimedPublicationService, startOfToday };
