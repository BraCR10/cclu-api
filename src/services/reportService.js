const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Listing } = require('../models/Listing');
const { Promotion } = require('../models/Promotion');
const { Discount } = require('../models/Discount');
const { Job } = require('../models/Job');
const { ADMIN_STATUSES } = require('../config/adminStatus');
const { refuse, CODES, PATTERNS } = require('../config/memberRules');
const { hasPaidMembership, MEMBERSHIP_TYPES } = require('./membershipService');
const { findVisibleOwnerIds } = require('./publicationAccessService');
const { startOfToday } = require('./timedPublicationService');

// Which reports exist and what each row of them says. A report the chamber
// can hold in its hands is a filtered list, not a chart (RF-ADM-007).
const MEMBER_REPORT_TYPES = ['members', 'paid_members', 'unpaid_members'];

const PUBLICATION_REPORTS = {
  products: { Model: Listing, headline: 'title', dated: false },
  promotions: { Model: Promotion, headline: 'title', dated: true },
  discounts: { Model: Discount, headline: 'description', dated: true },
  jobs: { Model: Job, headline: 'title', dated: false },
};

const REPORT_TYPES = [...MEMBER_REPORT_TYPES, ...Object.keys(PUBLICATION_REPORTS)];

function readReportType(value) {
  if (typeof value !== 'string' || !REPORT_TYPES.includes(value)) {
    refuse(CODES.NOT_ALLOWED, 'type', 'The report type is not one of the accepted values.');
  }

  return value;
}

function territoryFilter({ canton, sector }) {
  const filter = {};

  if (typeof canton === 'string' && PATTERNS.objectId.test(canton)) {
    filter.canton = canton;
  }

  if (typeof sector === 'string' && PATTERNS.objectId.test(sector)) {
    filter.sector = sector;
  }

  return filter;
}

function findApprovedMembers(filter) {
  return Member.find({ applicationStatus: APPLICATION_STATUSES.APPROVED, ...filter })
    .select('businessName memberCode email paidUntil')
    .populate('canton', 'name')
    .populate('sector', 'name')
    .sort({ businessName: 1 })
    .lean();
}

function presentMemberRow(member, now) {
  return {
    businessName: member.businessName,
    memberCode: member.memberCode ?? null,
    email: member.email,
    canton: member.canton?.name ?? null,
    sector: member.sector?.name ?? null,
    membership: hasPaidMembership(member, now) ? MEMBERSHIP_TYPES.PAID : MEMBERSHIP_TYPES.FREE,
  };
}

function findVisiblePublications(definition, owners, now) {
  const filter = {
    member: { $in: owners },
    isActive: true,
    adminStatus: ADMIN_STATUSES.ACTIVE,
  };

  if (definition.dated) {
    filter.validUntil = { $gte: startOfToday(now) };
  }

  return definition.Model.find(filter)
    .select(`member ${definition.headline} validUntil createdAt`)
    .populate({
      path: 'member',
      select: 'businessName',
      populate: [
        { path: 'canton', select: 'name' },
        { path: 'sector', select: 'name' },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();
}

function presentPublicationRow(definition, document) {
  const member =
    document.member !== null && typeof document.member === 'object' ? document.member : null;

  return {
    title: document[definition.headline],
    businessName: member?.businessName ?? null,
    canton: member?.canton?.name ?? null,
    sector: member?.sector?.name ?? null,
    validUntil: document.validUntil ?? null,
    createdAt: document.createdAt,
  };
}

async function buildReport(
  query,
  findMembers = findApprovedMembers,
  findOwners = findVisibleOwnerIds,
  findPublications = findVisiblePublications,
  now = () => new Date(),
) {
  const type = readReportType(query?.type);
  const filter = territoryFilter(query ?? {});

  if (MEMBER_REPORT_TYPES.includes(type)) {
    const members = await findMembers(filter);
    let rows = members.map((member) => presentMemberRow(member, now));

    if (type === 'paid_members') {
      rows = rows.filter((row) => row.membership === MEMBERSHIP_TYPES.PAID);
    }

    if (type === 'unpaid_members') {
      rows = rows.filter((row) => row.membership === MEMBERSHIP_TYPES.FREE);
    }

    return { type, total: rows.length, rows };
  }

  const definition = PUBLICATION_REPORTS[type];

  // The report counts what the public can actually see, which is the same
  // rule every public listing answers to.
  const owners = await findOwners({ canton: query?.canton, sector: query?.sector }, now);
  const documents = await findPublications(definition, owners, now);
  const rows = documents.map((document) => presentPublicationRow(definition, document));

  return { type, total: rows.length, rows };
}

module.exports = { buildReport, REPORT_TYPES };
