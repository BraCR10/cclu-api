const { Listing } = require('../models/Listing');
const { Promotion } = require('../models/Promotion');
const { Discount } = require('../models/Discount');
const { Job } = require('../models/Job');
const { ADMIN_STATUSES } = require('../config/adminStatus');
const { ValidationError, refuse, CODES, PATTERNS } = require('../config/memberRules');
const { readPage, readLimit } = require('./publicationAccessService');

// One row per kind of publication the chamber may moderate. The headline is
// whichever field identifies the item to a person: a discount has no title,
// so its description stands in.
const PUBLICATION_TYPES = {
  products: { Model: Listing, headline: 'title' },
  promotions: { Model: Promotion, headline: 'title' },
  discounts: { Model: Discount, headline: 'description' },
  jobs: { Model: Job, headline: 'title' },
};

const MODERATION_ACTIONS = {
  deactivate: ADMIN_STATUSES.INACTIVE,
  reactivate: ADMIN_STATUSES.ACTIVE,
  block: ADMIN_STATUSES.BLOCKED,
};

function readType(value) {
  if (typeof value !== 'string' || PUBLICATION_TYPES[value] === undefined) {
    refuse(CODES.NOT_ALLOWED, 'type', 'The publication type is not one of the accepted values.');
  }

  return value;
}

function presentModerated(type, definition, document) {
  return {
    id: String(document._id),
    type,
    title: document[definition.headline],
    isActive: document.isActive,
    adminStatus: document.adminStatus,
    validUntil: document.validUntil ?? null,
    createdAt: document.createdAt,
    business:
      document.member !== null && typeof document.member === 'object'
        ? {
            businessName: document.member.businessName,
            memberCode: document.member.memberCode ?? null,
          }
        : null,
  };
}

function moderationFields(definition) {
  return `member ${definition.headline} isActive adminStatus validUntil createdAt`;
}

function findPublications(definition, skip, limit) {
  return definition.Model.find({})
    .select(moderationFields(definition))
    .populate('member', 'businessName memberCode')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

function countPublications(definition) {
  return definition.Model.countDocuments({});
}

// Everything, whatever its state: moderation exists to look at what the
// public cannot see just as much as at what it can.
async function listPublications(
  query,
  find = findPublications,
  count = countPublications,
  types = PUBLICATION_TYPES,
) {
  const type = readType(query?.type);
  const definition = types[type];
  const page = readPage(query?.page);
  const limit = readLimit(query?.limit);
  const skip = (page - 1) * limit;

  const [documents, total] = await Promise.all([find(definition, skip, limit), count(definition)]);

  return {
    items: documents.map((document) => presentModerated(type, definition, document)),
    total,
    page,
    limit,
    hasMore: skip + documents.length < total,
  };
}

function readAction(body) {
  const action = body === null || typeof body !== 'object' ? undefined : body.action;

  if (typeof action !== 'string' || MODERATION_ACTIONS[action] === undefined) {
    refuse(CODES.NOT_ALLOWED, 'action', 'The action is not one of the accepted values.');
  }

  return action;
}

function notFound() {
  return new ValidationError(
    CODES.UNKNOWN_REFERENCE,
    null,
    'That publication no longer exists.',
    404,
  );
}

function findPublicationStatus(definition, id) {
  return definition.Model.findById(id).select('adminStatus').lean();
}

function applyModeration(definition, id, adminStatus) {
  return definition.Model.findByIdAndUpdate(
    id,
    { $set: { adminStatus } },
    { returnDocument: 'after', runValidators: true },
  )
    .select(moderationFields(definition))
    .populate('member', 'businessName memberCode')
    .lean();
}

async function moderatePublication(
  rawType,
  id,
  body,
  findStatus = findPublicationStatus,
  apply = applyModeration,
  types = PUBLICATION_TYPES,
) {
  const type = readType(rawType);
  const definition = types[type];
  const action = readAction(body);

  if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
    throw notFound();
  }

  const existing = await findStatus(definition, id);

  if (existing === null || existing === undefined) {
    throw notFound();
  }

  // Blocked is permanent by definition (CA-ADM-008-04): a door closed that
  // way does not reopen, not even from this side.
  if (existing.adminStatus === ADMIN_STATUSES.BLOCKED) {
    refuse(CODES.BLOCKED_PUBLICATION, null, 'A blocked publication cannot be changed again.');
  }

  const moderated = await apply(definition, id, MODERATION_ACTIONS[action]);

  if (moderated === null || moderated === undefined) {
    throw notFound();
  }

  return presentModerated(type, definition, moderated);
}

module.exports = { listPublications, moderatePublication, PUBLICATION_TYPES };
