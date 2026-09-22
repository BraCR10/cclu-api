const { Job, CONTRACT_TYPES } = require('../models/Job');
const { ADMIN_STATUSES } = require('../config/adminStatus');
const { ValidationError, CODES, refuse, PATTERNS } = require('../config/memberRules');
const { readRequiredText, readOptionalText, requireBody } = require('../config/postingFields');
const {
  isOwnerVisible,
  findVisibleOwnerIds,
  readPage,
  readLimit,
} = require('./publicationAccessService');

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const REQUIREMENTS_MAX = 2000;
const HOW_TO_APPLY_MAX = 1000;
const LOCATION_MAX = 200;

const JOB_FIELDS =
  'member title description requirements howToApply contractType location ' +
  'contactEmail contactPhone isActive adminStatus createdAt';

// What the board shows about the commerce, and what the contact falls back to
// when the posting names none of its own (CA-EMP-001-05).
const JOB_MEMBER_POPULATE = {
  path: 'member',
  select: 'businessName memberCode email phone paidUntil applicationStatus accountStatus',
};

function readContractType(body) {
  const value = body.contractType;

  if (typeof value !== 'string' || !Object.values(CONTRACT_TYPES).includes(value)) {
    refuse(
      CODES.NOT_ALLOWED,
      'contractType',
      'The field contractType is not one of the accepted values.',
    );
  }

  return value;
}

function notFound() {
  return new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That posting no longer exists.', 404);
}

function notOwner() {
  return new ValidationError(
    CODES.NOT_ALLOWED,
    null,
    'This posting belongs to another member.',
    403,
  );
}

// The one shape a job takes wherever it is read: on the public board, in a
// member's own list, or freshly created. The contact is resolved here: the
// posting's own, or the commerce's, so a reader always has somewhere to write.
function presentJob(job) {
  const member = job.member !== null && typeof job.member === 'object' ? job.member : null;

  return {
    id: String(job._id),
    title: job.title,
    description: job.description,
    requirements: job.requirements,
    howToApply: job.howToApply,
    contractType: job.contractType,
    location: job.location ?? null,
    contactEmail: job.contactEmail ?? member?.email ?? null,
    contactPhone: job.contactPhone ?? member?.phone ?? null,
    isActive: job.isActive,
    adminStatus: job.adminStatus ?? ADMIN_STATUSES.ACTIVE,
    createdAt: job.createdAt,
    business:
      member === null
        ? null
        : { businessName: member.businessName, memberCode: member.memberCode ?? null },
  };
}

function findPublicJobs(filter, skip, limit) {
  return Job.find(filter)
    .select(JOB_FIELDS)
    .populate(JOB_MEMBER_POPULATE)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

function countJobs(filter) {
  return Job.countDocuments(filter);
}

async function listJobs(
  query,
  findOwners = findVisibleOwnerIds,
  find = findPublicJobs,
  count = countJobs,
) {
  const page = readPage(query?.page);
  const limit = readLimit(query?.limit);

  // Owners without the paid membership are settled before skip and limit, so
  // the pages stay full and the count says what a visitor can actually open.
  const owners = await findOwners({});
  const filter = {
    member: { $in: owners },
    isActive: true,
    adminStatus: ADMIN_STATUSES.ACTIVE,
  };

  if (
    typeof query?.contractType === 'string' &&
    Object.values(CONTRACT_TYPES).includes(query.contractType)
  ) {
    filter.contractType = query.contractType;
  }

  const skip = (page - 1) * limit;
  const [jobs, total] = await Promise.all([find(filter, skip, limit), count(filter)]);

  return { items: jobs.map(presentJob), total, page, limit, hasMore: skip + jobs.length < total };
}

function findPublicJobById(id) {
  return Job.findById(id).select(JOB_FIELDS).populate(JOB_MEMBER_POPULATE).lean();
}

async function getJobById(id, find = findPublicJobById) {
  if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
    throw notFound();
  }

  const job = await find(id);

  const visible =
    job !== null &&
    job !== undefined &&
    job.isActive === true &&
    (job.adminStatus ?? ADMIN_STATUSES.ACTIVE) === ADMIN_STATUSES.ACTIVE &&
    isOwnerVisible(job.member);

  if (!visible) {
    throw notFound();
  }

  return presentJob(job);
}

function findOwnJobs(memberId) {
  return Job.find({ member: memberId }).select(JOB_FIELDS).sort({ createdAt: -1 }).lean();
}

async function listOwnJobs(memberId, find = findOwnJobs) {
  const jobs = await find(memberId);

  return jobs.map(presentJob);
}

async function createJob(
  memberId,
  rawBody,
  save = (job) => Job.create(job).then((created) => created.toObject()),
) {
  const body = requireBody(rawBody);

  const created = await save({
    member: memberId,
    title: readRequiredText(body, 'title', TITLE_MAX),
    description: readRequiredText(body, 'description', DESCRIPTION_MAX),
    requirements: readRequiredText(body, 'requirements', REQUIREMENTS_MAX),
    howToApply: readRequiredText(body, 'howToApply', HOW_TO_APPLY_MAX),
    contractType: readContractType(body),
    location: readOptionalText(body, 'location', LOCATION_MAX),
    contactEmail: readOptionalText(body, 'contactEmail', 254, 'email'),
    contactPhone: readOptionalText(body, 'contactPhone', 20, 'phone'),
  });

  return presentJob(created);
}

function findJobForOwner(id) {
  return Job.findById(id).select(JOB_FIELDS).lean();
}

async function requireOwnedJob(id, memberId, find) {
  if (typeof id !== 'string' || !PATTERNS.objectId.test(id)) {
    throw notFound();
  }

  const job = await find(id);

  if (job === null || job === undefined) {
    throw notFound();
  }

  if (String(job.member) !== String(memberId)) {
    throw notOwner();
  }

  // Blocked is the chamber's decision, and it is permanent: not even the
  // owner may touch the record again (CA-ADM-008-04).
  if (job.adminStatus === ADMIN_STATUSES.BLOCKED) {
    throw new ValidationError(
      CODES.BLOCKED_PUBLICATION,
      null,
      'This posting was blocked by the chamber and cannot be changed.',
      403,
    );
  }

  return job;
}

function buildJobChanges(rawBody) {
  const body = requireBody(rawBody);
  const changes = {};
  const unset = {};

  if ('title' in body) {
    changes.title = readRequiredText(body, 'title', TITLE_MAX);
  }

  if ('description' in body) {
    changes.description = readRequiredText(body, 'description', DESCRIPTION_MAX);
  }

  if ('requirements' in body) {
    changes.requirements = readRequiredText(body, 'requirements', REQUIREMENTS_MAX);
  }

  if ('howToApply' in body) {
    changes.howToApply = readRequiredText(body, 'howToApply', HOW_TO_APPLY_MAX);
  }

  if ('contractType' in body) {
    changes.contractType = readContractType(body);
  }

  for (const [field, maxLength, pattern] of [
    ['location', LOCATION_MAX],
    ['contactEmail', 254, 'email'],
    ['contactPhone', 20, 'phone'],
  ]) {
    if (!(field in body)) {
      continue;
    }

    const value = readOptionalText(body, field, maxLength, pattern);

    if (value === undefined) {
      unset[field] = '';
    } else {
      changes[field] = value;
    }
  }

  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') {
      refuse(CODES.NOT_TEXT, 'isActive', 'The field isActive must be true or false.');
    }

    changes.isActive = body.isActive;
  }

  if (Object.keys(changes).length === 0 && Object.keys(unset).length === 0) {
    refuse(CODES.NOTHING_TO_CHANGE, null, 'The request changes nothing.');
  }

  return { changes, unset };
}

async function updateJob(
  id,
  memberId,
  rawBody,
  find = findJobForOwner,
  apply = (jobId, update) =>
    Job.findByIdAndUpdate(jobId, update, { returnDocument: 'after', runValidators: true })
      .select(JOB_FIELDS)
      .lean(),
) {
  await requireOwnedJob(id, memberId, find);

  const { changes, unset } = buildJobChanges(rawBody);
  const update = { $set: changes };

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  return presentJob(await apply(id, update));
}

// "Deleting" a posting closes it rather than removing the record: published
// content is kept permanently under BD-003, the same rule a rejected
// application or a suspended account already answers to.
async function closeJob(
  id,
  memberId,
  find = findJobForOwner,
  apply = (jobId) => Job.findByIdAndUpdate(jobId, { $set: { isActive: false } }),
) {
  await requireOwnedJob(id, memberId, find);
  await apply(id);
}

module.exports = {
  listJobs,
  getJobById,
  listOwnJobs,
  createJob,
  updateJob,
  closeJob,
};
