const mongoose = require('mongoose');
const { Member, MEMBER_TYPES } = require('../models/Member');
const { Membership } = require('../models/Membership');
const { Payment } = require('../models/Payment');
const { Publication } = require('../models/Publication');
const { Plan } = require('../models/Plan');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { AuditEntry, AUDIT_ACTIONS } = require('../models/AuditEntry');
const { readText, readChoice, refuse, ValidationError, FIELDS } = require('../config/memberRules');
const { ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');
const { escapeForRegex, readSearch } = require('../config/listSearch');
const { toCsv } = require('../config/csv');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MEMBER_STATUSES = [ACCOUNT_STATUSES.ACTIVE, ACCOUNT_STATUSES.SUSPENDED];
const MEMBER_TYPE_VALUES = Object.values(MEMBER_TYPES);
const LAST_MOVEMENTS = 10;

// What an administrator may correct on somebody's record. The address, the
// document and the trade are not here: those are what the application was
// decided on, and editing them silently would rewrite a decision.
const EDITABLE_FIELDS = [
  'phone',
  'whatsappNumber',
  'billingEmail',
  'website',
  'instagram',
  'facebook',
  'linkedin',
];

const REASON_LENGTH = { MINIMUM: 10, MAXIMUM: 500 };

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

function readMemberId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ValidationError(ERROR_CODES.INVALID_FORMAT, null, 'That member does not exist.');
  }

  return value;
}

async function readPlanId(query, store) {
  const key = query?.plan;

  if (key === undefined || key === null || key === '') {
    return undefined;
  }

  if (typeof key !== 'string') {
    refuse(ERROR_CODES.INVALID_FORMAT, 'plan', 'The plan is one of the catalog keys.');
  }

  const plan = await store.findPlanByKey(key.trim());

  if (plan === null || plan === undefined) {
    refuse(ERROR_CODES.UNKNOWN_REFERENCE, 'plan', 'That plan does not exist.');
  }

  return plan._id;
}

// A search answers to what a person says at the counter: the business, the
// person, the address, the document, or the code printed on the card.
function searchFilter(query) {
  const search = readSearch(query);

  if (search === null) {
    return {};
  }

  const pattern = new RegExp(escapeForRegex(search), 'i');

  return {
    $or: [
      { businessName: pattern },
      { name: pattern },
      { email: pattern },
      { identificationNumber: pattern },
      { memberCode: pattern },
    ],
  };
}

async function readFilters(query, store) {
  const status = query?.accountStatus;
  const memberType = query?.memberType;
  const canton = query?.canton;

  if (status !== undefined && status !== '' && !MEMBER_STATUSES.includes(status)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'accountStatus', 'That account state does not exist.');
  }

  if (memberType !== undefined && memberType !== '' && !MEMBER_TYPE_VALUES.includes(memberType)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'memberType', 'That member type does not exist.');
  }

  if (canton !== undefined && canton !== '' && !OBJECT_ID.test(canton)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'canton', 'canton is a catalog identifier.');
  }

  const planId = await readPlanId(query, store);
  const planMembers = planId === undefined ? undefined : await store.memberIdsOnPlan(planId);

  return {
    ...searchFilter(query),
    // Only decided applications have a record here; a pending one lives in the
    // applications screen.
    applicationStatus: 'approved',
    ...(status === undefined || status === '' ? {} : { accountStatus: status }),
    ...(memberType === undefined || memberType === '' ? {} : { memberType }),
    ...(canton === undefined || canton === ''
      ? {}
      : { canton: new mongoose.Types.ObjectId(canton) }),
    ...(planMembers === undefined ? {} : { _id: { $in: planMembers } }),
  };
}

const LIST_FIELDS =
  'businessName name email phone memberType memberCode accountStatus canton district createdAt';

function presentMember(member, plan) {
  return {
    id: String(member._id),
    businessName: member.businessName ?? member.name ?? null,
    name: member.name ?? null,
    email: member.email,
    phone: member.phone ?? null,
    memberType: member.memberType,
    memberCode: member.memberCode ?? null,
    accountStatus: member.accountStatus,
    canton: member.canton?.name ?? null,
    district: member.district ?? null,
    joinedAt: member.createdAt,
    plan:
      plan === null || plan === undefined
        ? null
        : {
            key: plan.plan?.key ?? null,
            name: plan.plan?.name ?? null,
            expiresAt: plan.expiresAt ?? null,
          },
  };
}

const defaultStore = {
  list: (filter, { skip, pageSize }) =>
    Member.find(filter)
      .select(LIST_FIELDS)
      .populate('canton', 'name province')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  count: (filter) => Member.countDocuments(filter),
  all: (filter) =>
    Member.find(filter).select(LIST_FIELDS).populate('canton', 'name province').lean(),
  memberships: (ids) =>
    Membership.find({ member: { $in: ids } })
      .populate('plan', 'key name')
      .lean(),
  findPlanByKey: (key) => Plan.findOne({ key }).select('_id').lean(),
  memberIdsOnPlan: async (planId) =>
    (await Membership.find({ plan: planId }).select('member').lean()).map((row) => row.member),
  findById: (id) =>
    Member.findById(id)
      .select('-passwordHash')
      .populate('canton', 'name province')
      .populate('activity', 'name')
      .lean(),
  membershipOf: (id) => Membership.findOne({ member: id }).populate('plan', 'key name').lean(),
  paymentsOf: (id) =>
    Payment.find({ member: id })
      .select('planName amount status submittedAt decidedAt')
      .sort({ submittedAt: -1 })
      .limit(LAST_MOVEMENTS)
      .lean(),
  publicationsOf: (id) =>
    Publication.find({ member: id, removedAt: null })
      .select('title type status publishedAt')
      .sort({ publishedAt: -1 })
      .limit(LAST_MOVEMENTS)
      .lean(),
  update: (id, fields) =>
    Member.findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' })
      .select('-passwordHash')
      .lean(),
  writeAudit: (entry) => AuditEntry.create(entry),
  actorName: (id) => Admin.findById(id).select('name email').lean(),
};

async function listMembers(query, store = defaultStore) {
  const filter = await readFilters(query, store);
  const pagination = readPagination(query);
  const [rows, total] = await Promise.all([store.list(filter, pagination), store.count(filter)]);
  const memberships = await store.memberships(rows.map((row) => row._id));
  const byMember = new Map(
    memberships.map((membership) => [String(membership.member), membership]),
  );

  return paginated(
    rows.map((row) => presentMember(row, byMember.get(String(row._id)))),
    total,
    pagination,
  );
}

// Every member the filters match, not only the page on screen, for the board's
// own spreadsheets. The file is Spanish because a person opens it.
async function exportMembers(query, store = defaultStore) {
  const filter = await readFilters(query, store);
  const rows = await store.all(filter);
  const memberships = await store.memberships(rows.map((row) => row._id));
  const byMember = new Map(
    memberships.map((membership) => [String(membership.member), membership]),
  );
  const members = rows.map((row) => presentMember(row, byMember.get(String(row._id))));

  return toCsv(
    [
      'Código',
      'Negocio',
      'Correo electrónico',
      'Teléfono',
      'Tipo',
      'Cantón',
      'Distrito',
      'Plan',
      'Estado',
      'Afiliación',
    ],
    members.map((member) => [
      member.memberCode ?? '',
      member.businessName ?? '',
      member.email,
      member.phone ?? '',
      member.memberType,
      member.canton ?? '',
      member.district ?? '',
      member.plan?.name ?? 'Gratuita',
      member.accountStatus,
      new Date(member.joinedAt).toISOString().slice(0, 10),
    ]),
  );
}

// The record as the panel reads it: who they are, the plan they hold, what they
// have paid and what they have published. Four tabs, one answer.
async function readMember(memberId, store = defaultStore) {
  const id = readMemberId(memberId);
  const member = await store.findById(id);

  if (member === null || member === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That member does not exist.',
      404,
    );
  }

  const [membership, payments, publications] = await Promise.all([
    store.membershipOf(id),
    store.paymentsOf(id),
    store.publicationsOf(id),
  ]);

  return {
    ...presentMember(member, membership),
    identificationType: member.identificationType,
    identificationNumber: member.identificationNumber,
    legalName: member.legalName ?? null,
    legalRepresentativeName: member.legalRepresentativeName ?? null,
    businessDescription: member.businessDescription ?? null,
    activity: member.activity?.name ?? member.activityOther ?? null,
    location: member.location ?? null,
    whatsappNumber: member.whatsappNumber ?? null,
    billingEmail: member.billingEmail ?? null,
    institutionalPhone: member.institutionalPhone ?? null,
    website: member.website ?? null,
    instagram: member.instagram ?? null,
    facebook: member.facebook ?? null,
    linkedin: member.linkedin ?? null,
    membership:
      membership === null || membership === undefined
        ? null
        : {
            status: membership.status,
            startedAt: membership.startedAt,
            expiresAt: membership.expiresAt ?? null,
            frequency: membership.frequency ?? null,
          },
    payments: payments.map((payment) => ({
      id: String(payment._id),
      planName: payment.planName,
      amount: payment.amount,
      status: payment.status,
      submittedAt: payment.submittedAt,
      decidedAt: payment.decidedAt ?? null,
    })),
    publications: publications.map((publication) => ({
      id: String(publication._id),
      title: publication.title,
      type: publication.type,
      status: publication.status,
      publishedAt: publication.publishedAt,
    })),
  };
}

// Corrections to the contact details, and nothing else: the fields read are
// listed rather than taken from the body, so a request carrying a status or a
// code is simply never read.
async function updateMember(memberId, body, store = defaultStore) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(ERROR_CODES.BODY_MISSING, null, 'The body is missing.');
  }

  const id = readMemberId(memberId);
  const changes = {};

  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) {
      continue;
    }

    changes[field] = readText(body, field, { ...FIELDS[field], required: false }) ?? null;
  }

  if (Object.keys(changes).length === 0) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, null, 'Nothing in that request changes the member.');
  }

  const updated = await store.update(id, changes);

  if (updated === null || updated === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That member does not exist.',
      404,
    );
  }

  await store.writeAudit({
    action: AUDIT_ACTIONS.MEMBER_UPDATED,
    actor: { role: 'admin', name: 'admin' },
    subject: { type: 'Member', id: updated._id, label: updated.businessName ?? updated.email },
    changes: Object.entries(changes).map(([field, after]) => ({ field, before: null, after })),
  });

  return readMember(id, store);
}

// Suspending is not deleting: the record stays, the sign-in stops, and the
// reason is kept so the person asking why has an answer.
async function setMemberStatus(identity, memberId, body, store = defaultStore, now = new Date()) {
  const reason = readReason(body);
  const status = readChoice(body, 'status', MEMBER_STATUSES);
  const id = readMemberId(memberId);
  const member = await store.findById(id);

  if (member === null || member === undefined) {
    throw new ValidationError(
      ERROR_CODES.UNKNOWN_REFERENCE,
      null,
      'That member does not exist.',
      404,
    );
  }

  if (member.accountStatus === status) {
    refuse(ERROR_CODES.NOTHING_TO_CHANGE, 'status', 'The account is already in that state.');
  }

  await store.update(id, { accountStatus: status, statusReason: reason });

  await store.writeAudit({
    action:
      status === ACCOUNT_STATUSES.SUSPENDED
        ? AUDIT_ACTIONS.MEMBER_SUSPENDED
        : AUDIT_ACTIONS.MEMBER_REACTIVATED,
    actor: { role: identity.role, name: await actorLabel(identity, store) },
    subject: { type: 'Member', id: member._id, label: member.businessName ?? member.email },
    changes: [
      { field: 'accountStatus', before: member.accountStatus, after: status },
      { field: 'statusReason', before: null, after: reason },
    ],
    occurredAt: now,
  });

  return readMember(id, store);
}

async function actorLabel(identity, store) {
  const actor = await store.actorName(identity.id);

  return actor?.name ?? actor?.email ?? 'admin';
}

module.exports = {
  listMembers,
  exportMembers,
  readMember,
  updateMember,
  setMemberStatus,
  EDITABLE_FIELDS,
  MEMBER_STATUSES,
};
