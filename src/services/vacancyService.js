const { Vacancy, WORKDAYS } = require('../models/Vacancy');
const { Branch } = require('../models/Branch');
// Registered here because a vacancy's branch populates its canton.
require('../models/Canton');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readText, readChoice, PATTERNS } = require('../config/memberRules');
const { readPagination, paginated } = require('../config/pagination');
const { grants, readEffectivePlan } = require('./entitlementService');

const ENTITLEMENT = 'publishJobs';

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That vacancy no longer exists.', {
    statusCode: 404,
  });
}

function presentVacancy(vacancy) {
  // Populated, or left out when the branch was closed since.
  const branch = typeof vacancy.branch?.name === 'string' ? vacancy.branch : null;

  return {
    id: String(vacancy._id),
    title: vacancy.title,
    description: vacancy.description,
    requirements: vacancy.requirements ?? null,
    workday: vacancy.workday,
    howToApply: vacancy.howToApply,
    status: vacancy.status,
    inactiveReason: vacancy.inactiveReason ?? null,
    publishedAt: vacancy.publishedAt,
    branch:
      branch === null
        ? null
        : {
            id: String(branch._id),
            name: branch.name,
            district: branch.district ?? null,
            canton: branch.canton?.name ?? null,
          },
  };
}

const OWN = (memberId) => ({ member: memberId, removedAt: null });

const BRANCH_FIELDS = {
  path: 'branch',
  select: 'name district canton',
  populate: { path: 'canton', select: 'name' },
};

const defaultStore = {
  readPlan: (memberId, now) => readEffectivePlan(memberId, now),
  findBranch: (memberId, branchId) =>
    Branch.findOne({ _id: branchId, member: memberId, removedAt: null }).select('_id').lean(),
  list: (memberId, { skip, pageSize }) =>
    Vacancy.find(OWN(memberId))
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate(BRANCH_FIELDS)
      .lean(),
  find: (vacancyId) => Vacancy.findById(vacancyId).populate(BRANCH_FIELDS).lean(),
  count: (memberId) => Vacancy.countDocuments(OWN(memberId)),
  create: async (fields) => (await Vacancy.create(fields)).toObject(),
  remove: (memberId, vacancyId, now) =>
    Vacancy.updateOne({ _id: vacancyId, ...OWN(memberId) }, { $set: { removedAt: now } }),
};

// The member's own vacancies, and whether their plan lets them publish one now,
// so the screen can offer the form or explain what unlocks it.
async function listOwnVacancies(memberId, query, now, store = defaultStore) {
  const pagination = readPagination(query);
  const [items, total, plan] = await Promise.all([
    store.list(memberId, pagination),
    store.count(memberId),
    store.readPlan(memberId, now),
  ]);

  return {
    ...paginated(items.map(presentVacancy), total, pagination),
    canPublish: grants(plan, ENTITLEMENT),
  };
}

// The branch is checked against the member: a vacancy can only be placed at one
// of their own open branches, never at another business's.
async function createVacancy(memberId, body, now, store = defaultStore) {
  const fields = {
    title: readText(body, 'title', { required: true }),
    description: readText(body, 'description', { required: true }),
    requirements: readText(body, 'requirements', { required: false }),
    workday: readChoice(body, 'workday', Object.values(WORKDAYS)),
    howToApply: readText(body, 'howToApply', { required: true }),
  };
  const branchId = readText(body, 'branch', { required: true });

  if (!PATTERNS.objectId.test(branchId) || (await store.findBranch(memberId, branchId)) === null) {
    throw new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That branch is not one of yours.', {
      field: 'branch',
    });
  }

  const created = await store.create({
    ...fields,
    member: memberId,
    branch: branchId,
    publishedAt: now,
  });

  return presentVacancy((await store.find(created._id)) ?? created);
}

async function deleteOwnVacancy(memberId, vacancyId, now, store = defaultStore) {
  if (typeof vacancyId !== 'string' || !PATTERNS.objectId.test(vacancyId)) {
    throw notFound();
  }

  const { matchedCount } = await store.remove(memberId, vacancyId, now);

  if (matchedCount === 0) {
    throw notFound();
  }
}

module.exports = { listOwnVacancies, createVacancy, deleteOwnVacancy, presentVacancy, ENTITLEMENT };
