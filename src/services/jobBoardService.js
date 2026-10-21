const mongoose = require('mongoose');
const { Vacancy, VACANCY_STATUSES, WORKDAYS } = require('../models/Vacancy');
const { Branch } = require('../models/Branch');
const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Membership } = require('../models/Membership');
const { Plan } = require('../models/Plan');
// Registered here because a vacancy's branch populates its canton.
require('../models/Canton');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { refuse } = require('../config/memberRules');
const { readPagination, paginated } = require('../config/pagination');
const { escapeForRegex, readSearch } = require('../config/listSearch');
const { latestTrustedExpiry } = require('../config/chamberCalendar');
const { formatMemberCode } = require('./memberCodeService');

const DEFAULT_PAGE_SIZE = '9';
const MAXIMUM_DISTRICT_LENGTH = 80;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const SPANISH = { locale: 'es', strength: 1 };

const SHOWN = { status: VACANCY_STATUSES.ACTIVE, removedAt: null };

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That vacancy is not on the board.', {
    statusCode: 404,
  });
}

function readOptionalChoice(query, field, allowed) {
  const raw = query?.[field];

  if (raw === undefined || raw === '') {
    return null;
  }

  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `${field} is one of ${allowed.join(', ')}.`);
  }

  return raw;
}

function readBoardQuery(query) {
  const canton = query?.canton;
  const district = query?.district;

  if (
    canton !== undefined &&
    canton !== '' &&
    (typeof canton !== 'string' || !OBJECT_ID.test(canton))
  ) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'canton', 'canton is a catalog identifier.');
  }

  if (
    district !== undefined &&
    district !== '' &&
    (typeof district !== 'string' || district.trim().length > MAXIMUM_DISTRICT_LENGTH || !canton)
  ) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'district', 'A district is filtered within a canton.');
  }

  return {
    search: readSearch(query),
    canton: canton ? new mongoose.Types.ObjectId(canton) : null,
    district: district ? district.trim() : null,
    workday: readOptionalChoice(query, 'workday', Object.values(WORKDAYS)),
    pagination: readPagination({ pageSize: DEFAULT_PAGE_SIZE, ...query }),
  };
}

const defaultStore = {
  // Who may be on the board right now: listed in the directory, and holding a
  // plan that includes vacancies whose term has not run out. A plan that lapsed
  // takes its vacancies off the board at once, before the hourly run.
  findPublishingMembers: async (now) => {
    const plans = await Plan.find({ 'entitlements.publishJobs': true }).select('_id').lean();
    const holders = await Membership.distinct('member', {
      plan: { $in: plans.map((plan) => plan._id) },
      expiresAt: { $gt: now, $lte: latestTrustedExpiry(now) },
    });

    return Member.distinct('_id', {
      _id: { $in: holders },
      applicationStatus: APPLICATION_STATUSES.APPROVED,
      accountStatus: { $ne: ACCOUNT_STATUSES.SUSPENDED },
    });
  },
  findBranchesAt: (canton, district) =>
    Branch.distinct('_id', {
      canton,
      removedAt: null,
      ...(district === null ? {} : { district }),
    }).collation(SPANISH),
  list: (filter, { skip, pageSize }) =>
    Vacancy.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate({
        path: 'branch',
        select: 'name district canton',
        populate: { path: 'canton', select: 'name' },
      })
      .populate('member', 'businessName memberCode')
      .lean(),
  count: (filter) => Vacancy.countDocuments(filter),
  find: (vacancyId) =>
    Vacancy.findOne({ _id: vacancyId, ...SHOWN })
      .populate({
        path: 'branch',
        select: 'name district address canton',
        populate: { path: 'canton', select: 'name' },
      })
      .populate('member', 'businessName memberCode whatsappNumber logoFileKey')
      .lean(),
};

function presentPlace(branch) {
  return branch !== null && typeof branch === 'object' && typeof branch.name === 'string'
    ? {
        name: branch.name,
        district: branch.district ?? null,
        canton: branch.canton?.name ?? null,
        address: branch.address ?? null,
      }
    : null;
}

function presentListing(vacancy) {
  return {
    id: String(vacancy._id),
    title: vacancy.title,
    workday: vacancy.workday,
    publishedAt: vacancy.publishedAt,
    branch: presentPlace(vacancy.branch),
    business: {
      name: vacancy.member.businessName,
      memberCode: formatMemberCode(vacancy.member.memberCode),
    },
  };
}

async function listBoard(query, now, store = defaultStore) {
  const { search, canton, district, workday, pagination } = readBoardQuery(query);
  const members = await store.findPublishingMembers(now);
  const filter = {
    ...SHOWN,
    member: { $in: members },
    ...(search === null ? {} : { title: { $regex: escapeForRegex(search), $options: 'i' } }),
    ...(workday === null ? {} : { workday }),
    ...(canton === null ? {} : { branch: { $in: await store.findBranchesAt(canton, district) } }),
  };
  const [items, total] = await Promise.all([store.list(filter, pagination), store.count(filter)]);

  return paginated(items.map(presentListing), total, pagination);
}

// One vacancy, with how to apply and who posted it. One that is no longer on
// the board answers as if it never was, whatever the reason.
async function readBoardVacancy(vacancyId, now, store = defaultStore) {
  if (typeof vacancyId !== 'string' || !OBJECT_ID.test(vacancyId)) {
    throw notFound();
  }

  const [vacancy, members] = await Promise.all([
    store.find(vacancyId),
    store.findPublishingMembers(now),
  ]);

  if (
    vacancy === null ||
    vacancy.member === null ||
    !members.some((memberId) => String(memberId) === String(vacancy.member._id))
  ) {
    throw notFound();
  }

  return {
    ...presentListing(vacancy),
    description: vacancy.description,
    requirements: vacancy.requirements ?? null,
    howToApply: vacancy.howToApply,
    business: {
      name: vacancy.member.businessName,
      memberCode: formatMemberCode(vacancy.member.memberCode),
      whatsappNumber: vacancy.member.whatsappNumber ?? null,
      logoFileKey: vacancy.member.logoFileKey ?? null,
    },
  };
}

module.exports = { readBoardQuery, listBoard, readBoardVacancy };
