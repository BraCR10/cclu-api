const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { PUBLIC_FIELDS } = require('../config/memberPublicFields');
const { PATTERNS } = require('../config/memberRules');
const { presentPublicMember } = require('./memberPublicPresenter');
const { createDownloadUrl } = require('./fileStorageService');

const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 50;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readPage(value) {
  const page = Number.parseInt(value, 10);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readLimit(value) {
  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAXIMUM_LIMIT);
}

// Only an affiliate in good standing is listed, the same rule a card's code
// answers to. A pending or suspended member has no place in a public roll.
function buildFilter({ name, canton, sector }) {
  const filter = {
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
  };

  if (typeof name === 'string' && name.trim() !== '') {
    filter.businessName = new RegExp(escapeRegex(name.trim()), 'i');
  }

  if (typeof canton === 'string' && PATTERNS.objectId.test(canton)) {
    filter.canton = canton;
  }

  if (typeof sector === 'string' && PATTERNS.objectId.test(sector)) {
    filter.sector = sector;
  }

  return filter;
}

function findMembers(filter, skip, limit) {
  return Member.find(filter)
    .select(PUBLIC_FIELDS)
    .populate('canton', 'name province')
    .populate('sector', 'name')
    .sort({ businessName: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

function countMembers(filter) {
  return Member.countDocuments(filter);
}

async function listPublicDirectory(
  query,
  find = findMembers,
  count = countMembers,
  sign = createDownloadUrl,
) {
  const page = readPage(query?.page);
  const limit = readLimit(query?.limit);
  const filter = buildFilter(query ?? {});
  const skip = (page - 1) * limit;

  const [members, total] = await Promise.all([find(filter, skip, limit), count(filter)]);
  const items = await Promise.all(members.map((member) => presentPublicMember(member, sign)));

  return { items, total, page, limit, hasMore: skip + items.length < total };
}

module.exports = { listPublicDirectory };
