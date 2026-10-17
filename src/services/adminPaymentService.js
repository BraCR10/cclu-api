const mongoose = require('mongoose');
const { Payment, PAYMENT_STATUSES, REJECTION_REASON_LENGTH } = require('../models/Payment');
const { Member } = require('../models/Member');
const { Membership } = require('../models/Membership');
const { Admin } = require('../models/Admin');
const { AuditEntry, AUDIT_ACTIONS } = require('../models/AuditEntry');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { lastValidDay } = require('../config/chamberCalendar');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { refuse } = require('../config/memberRules');
const { readPagination, paginated } = require('../config/pagination');
const clock = require('../config/clock');
const emailService = require('./emailService');
const { formatMemberCode } = require('./memberCodeService');
const { grantFreeMembership } = require('./membershipService');
const { RENEWAL_FREQUENCY, holdsRunningPaidPlan, termFor } = require('./renewalPolicy');
const { presentPayment } = require('./paymentService');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DUPLICATE_KEY = 11000;
const MAXIMUM_SEARCH_LENGTH = 100;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const STATUSES = Object.values(PAYMENT_STATUSES);

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'There is no such payment.', {
    statusCode: 404,
  });
}

function readPaymentId(value) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw notFound();
  }

  return value;
}

function readListQuery(query) {
  const status = query?.status ?? PAYMENT_STATUSES.PENDING_REVIEW;

  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'status', `status is one of ${STATUSES.join(', ')}.`);
  }

  let search = null;

  if (query?.search !== undefined && query.search !== '') {
    if (typeof query.search !== 'string') {
      refuse(ERROR_CODES.NOT_TEXT, 'search', 'The search is text.');
    }

    if (query.search.trim().length > MAXIMUM_SEARCH_LENGTH) {
      refuse(
        ERROR_CODES.TOO_LONG,
        'search',
        `The search is at most ${MAXIMUM_SEARCH_LENGTH} characters.`,
      );
    }

    search = query.search.trim() || null;
  }

  return { status, search, pagination: readPagination(query) };
}

// The business name anywhere in it, or the start of the member code with its
// dashes ignored. Escaped, so it is only ever the characters typed.
function searchFilter(search) {
  if (search === null) {
    return null;
  }

  const escape = (text) => text.replace(REGEX_SPECIALS, '\\$&');
  const code = search.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const conditions = [{ 'member.businessName': { $regex: escape(search), $options: 'i' } }];

  if (code !== '') {
    conditions.push({ 'member.memberCode': { $regex: `^${escape(code)}` } });
  }

  return { $or: conditions };
}

// Pending payments oldest first, so the one waiting longest is reviewed first.
// Decided ones newest decision first.
function orderFor(status) {
  return status === PAYMENT_STATUSES.PENDING_REVIEW
    ? { submittedAt: 1, _id: 1 }
    : { decidedAt: -1, _id: 1 };
}

const JOIN_MEMBER = [
  {
    $lookup: {
      from: 'members',
      localField: 'member',
      foreignField: '_id',
      pipeline: [{ $project: { businessName: 1, memberCode: 1 } }],
      as: 'member',
    },
  },
  { $unwind: '$member' },
];

// Without a search, members are joined only to the page shown, so the cost of a
// list does not grow with the whole payment history. A search needs the join
// first, since it matches on the member.
function listPipeline({ status, search, pagination }) {
  const matchSearch = searchFilter(search);
  const page = [
    { $match: { status } },
    { $sort: orderFor(status) },
    { $skip: pagination.skip },
    { $limit: pagination.pageSize },
  ];
  const counts = [{ $group: { _id: '$status', count: { $sum: 1 } } }];

  if (matchSearch === null) {
    return [{ $facet: { counts, items: [...page, ...JOIN_MEMBER] } }];
  }

  return [...JOIN_MEMBER, { $match: matchSearch }, { $facet: { counts, items: page } }];
}

function presentForAdmin(payment, member) {
  return {
    ...presentPayment(payment),
    member: {
      id: String(member._id),
      businessName: member.businessName,
      memberCode: formatMemberCode(member.memberCode),
    },
  };
}

const defaultAdminPaymentStore = {
  aggregate: (pipeline) => Payment.aggregate(pipeline),
  findPayment: (paymentId) => Payment.findById(paymentId).lean(),
  findMember: (memberId) =>
    Member.findById(memberId).select('businessName memberCode email accountStatus').lean(),
  findAdmin: (adminId) => Admin.findById(adminId).select('name email').lean(),
  findMembership: (memberId) =>
    Membership.findOne({ member: memberId }).populate('plan', 'key name').lean(),
  grant: (memberId, startedAt) => grantFreeMembership(memberId, startedAt),
  findSameReceipt: (sha256, paymentId) =>
    Payment.find({ 'receipt.sha256': sha256, _id: { $ne: paymentId } })
      .select('status submittedAt')
      .sort({ submittedAt: -1 })
      .lean(),
  findEarlierAttempts: (memberId, paymentId) =>
    Payment.find({ member: memberId, _id: { $ne: paymentId }, status: PAYMENT_STATUSES.REJECTED })
      .sort({ submittedAt: -1 })
      .limit(5)
      .lean(),

  // The decision, the membership it extends and their audit entries are
  // written together or not at all. Each write names the state it read, so a
  // second decision, or an hourly run moving the membership in between, undoes
  // the whole of it.
  approve: ({ payment, membership, decidedAt, decidedBy, term, nextMembership, auditEntries }) =>
    mongoose.connection.transaction(async (session) => {
      let decided;

      try {
        decided = await Payment.updateOne(
          { _id: payment._id, status: PAYMENT_STATUSES.PENDING_REVIEW },
          { $set: { status: PAYMENT_STATUSES.APPROVED, decidedAt, decidedBy, term } },
          { session },
        );
      } catch (error) {
        // Another approval of the same receipt stood first.
        if (error.code === DUPLICATE_KEY) {
          throw new ApplicationError(
            ERROR_CODES.RECEIPT_ALREADY_USED,
            'This receipt already paid for another term.',
            { statusCode: 409 },
          );
        }

        throw error;
      }

      if (decided.matchedCount === 0) {
        throw new ApplicationError(
          ERROR_CODES.ALREADY_DECIDED,
          'The payment was already decided.',
          {
            statusCode: 409,
          },
        );
      }

      const renewed = await Membership.updateOne(
        { _id: membership._id, plan: membership.plan._id, expiresAt: membership.expiresAt },
        { $set: nextMembership },
        { session },
      );

      if (renewed.matchedCount === 0) {
        throw new ApplicationError(
          ERROR_CODES.CHANGED_MEANWHILE,
          'The membership changed meanwhile.',
          {
            statusCode: 409,
          },
        );
      }

      await AuditEntry.insertMany(auditEntries, { session });
    }),

  reject: ({ payment, decidedAt, decidedBy, reason, auditEntry }) =>
    mongoose.connection.transaction(async (session) => {
      const decided = await Payment.updateOne(
        { _id: payment._id, status: PAYMENT_STATUSES.PENDING_REVIEW },
        {
          $set: {
            status: PAYMENT_STATUSES.REJECTED,
            decidedAt,
            decidedBy,
            rejectionReason: reason,
          },
        },
        { session },
      );

      if (decided.matchedCount === 0) {
        throw new ApplicationError(
          ERROR_CODES.ALREADY_DECIDED,
          'The payment was already decided.',
          {
            statusCode: 409,
          },
        );
      }

      await AuditEntry.insertMany([auditEntry], { session });
    }),
};

async function listPayments(query, store = defaultAdminPaymentStore) {
  const request = readListQuery(query);
  const [result] = await store.aggregate(listPipeline(request));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));

  for (const bucket of result.counts) {
    counts[bucket._id] = bucket.count;
  }

  return {
    ...paginated(
      result.items.map((payment) => presentForAdmin(payment, payment.member)),
      counts[request.status],
      request.pagination,
    ),
    counts,
  };
}

async function readPaymentAndMember(paymentId, store) {
  const payment = await store.findPayment(readPaymentId(paymentId));

  if (payment === null || payment === undefined) {
    throw notFound();
  }

  const member = await store.findMember(payment.member);

  if (member === null || member === undefined) {
    throw notFound();
  }

  return { payment, member };
}

// Everything the review screen needs to decide: the payment, the rejected
// attempts before it, and whether the same receipt was handed in before.
async function readPayment(paymentId, store = defaultAdminPaymentStore) {
  const { payment, member } = await readPaymentAndMember(paymentId, store);
  const [sameReceipt, earlierAttempts] = await Promise.all([
    store.findSameReceipt(payment.receipt.sha256, payment._id),
    store.findEarlierAttempts(payment.member, payment._id),
  ]);

  return {
    ...presentForAdmin(payment, member),
    sameReceipt: sameReceipt.map((other) => ({
      id: String(other._id),
      status: other.status,
      submittedAt: other.submittedAt,
    })),
    earlierAttempts: earlierAttempts.map(presentPayment),
  };
}

async function readReceiptKey(paymentId, store = defaultAdminPaymentStore) {
  const { payment } = await readPaymentAndMember(paymentId, store);

  return payment.receipt.key;
}

async function readDecider(identity, store) {
  const admin = await store.findAdmin(identity.id);

  if (admin === null || admin === undefined) {
    throw new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That account no longer exists.', {
      statusCode: 404,
    });
  }

  return { id: admin._id, name: admin.name || admin.email };
}

function refuseUnlessPending(payment) {
  if (payment.status !== PAYMENT_STATUSES.PENDING_REVIEW) {
    throw new ApplicationError(ERROR_CODES.ALREADY_DECIDED, 'The payment was already decided.', {
      statusCode: 409,
      reason: payment.status,
    });
  }
}

async function approvePayment(
  identity,
  paymentId,
  store = defaultAdminPaymentStore,
  notify = emailService.notify,
  now = clock.now(),
) {
  const { payment, member } = await readPaymentAndMember(paymentId, store);

  refuseUnlessPending(payment);

  if (member.accountStatus === ACCOUNT_STATUSES.SUSPENDED) {
    throw new ApplicationError(ERROR_CODES.ACCOUNT_SUSPENDED, 'The account is suspended.', {
      statusCode: 409,
    });
  }

  const sameReceipt = await store.findSameReceipt(payment.receipt.sha256, payment._id);

  if (sameReceipt.some((other) => other.status === PAYMENT_STATUSES.APPROVED)) {
    throw new ApplicationError(
      ERROR_CODES.RECEIPT_ALREADY_USED,
      'This receipt already paid for another term.',
      {
        statusCode: 409,
      },
    );
  }

  let membership = await store.findMembership(payment.member);

  if (membership === null || membership === undefined) {
    await store.grant(payment.member, now);
    membership = await store.findMembership(payment.member);
  }

  const decidedBy = await readDecider(identity, store);
  const term = termFor(membership, now);
  // A renewal of the plan already running keeps the day it began. Anything else
  // begins with this approval.
  const keepsItsStart =
    holdsRunningPaidPlan(membership, now) && String(membership.plan._id) === String(payment.plan);

  const nextMembership = {
    plan: payment.plan,
    startedAt: keepsItsStart ? membership.startedAt : now,
    expiresAt: term.expiresAt,
    frequency: RENEWAL_FREQUENCY,
    lastPaymentAt: now,
    lapsed: null,
    reminderSentFor: null,
  };

  await store.approve({
    payment,
    membership,
    decidedAt: now,
    decidedBy,
    term,
    nextMembership,
    auditEntries: [
      {
        action: AUDIT_ACTIONS.PAYMENT_APPROVED,
        actor: { ...decidedBy, role: identity.role },
        subject: { type: 'Payment', id: payment._id, label: member.businessName },
        changes: [
          {
            field: 'status',
            before: PAYMENT_STATUSES.PENDING_REVIEW,
            after: PAYMENT_STATUSES.APPROVED,
          },
        ],
      },
      {
        action: AUDIT_ACTIONS.MEMBERSHIP_RENEWED,
        actor: { ...decidedBy, role: identity.role },
        subject: { type: 'Membership', id: membership._id, label: member.businessName },
        changes: [
          { field: 'plan', before: membership.plan.key, after: payment.planKey },
          { field: 'expiresAt', before: membership.expiresAt ?? null, after: term.expiresAt },
        ],
      },
    ],
  });

  const notified = await notify('paymentApproved', member.email, {
    businessName: member.businessName,
    planName: payment.planName,
    validUntil: lastValidDay(term.expiresAt),
  });

  return { ...(await readPayment(paymentId, store)), notified };
}

function readReason(body) {
  const reason = body?.reason;

  if (reason === undefined || reason === null || reason === '') {
    refuse(ERROR_CODES.REQUIRED, 'reason', 'The reason is required.');
  }

  if (typeof reason !== 'string') {
    refuse(ERROR_CODES.NOT_TEXT, 'reason', 'The reason is text.');
  }

  const text = reason.trim();

  if (
    text.length < REJECTION_REASON_LENGTH.MINIMUM ||
    text.length > REJECTION_REASON_LENGTH.MAXIMUM
  ) {
    refuse(
      ERROR_CODES.INVALID_FORMAT,
      'reason',
      `The reason is ${REJECTION_REASON_LENGTH.MINIMUM} to ${REJECTION_REASON_LENGTH.MAXIMUM} characters.`,
    );
  }

  return text;
}

async function rejectPayment(
  identity,
  paymentId,
  body,
  store = defaultAdminPaymentStore,
  notify = emailService.notify,
  now = clock.now(),
) {
  const reason = readReason(body);
  const { payment, member } = await readPaymentAndMember(paymentId, store);

  refuseUnlessPending(payment);

  const decidedBy = await readDecider(identity, store);

  await store.reject({
    payment,
    decidedAt: now,
    decidedBy,
    reason,
    auditEntry: {
      action: AUDIT_ACTIONS.PAYMENT_REJECTED,
      actor: { ...decidedBy, role: identity.role },
      subject: { type: 'Payment', id: payment._id, label: member.businessName },
      changes: [
        {
          field: 'status',
          before: PAYMENT_STATUSES.PENDING_REVIEW,
          after: PAYMENT_STATUSES.REJECTED,
        },
        { field: 'rejectionReason', before: null, after: reason },
      ],
    },
  });

  const notified = await notify('paymentRejected', member.email, {
    businessName: member.businessName,
    planName: payment.planName,
    reason,
  });

  return { ...(await readPayment(paymentId, store)), notified };
}

module.exports = {
  readListQuery,
  listPayments,
  readPayment,
  readReceiptKey,
  approvePayment,
  rejectPayment,
};
