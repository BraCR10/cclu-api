const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { Payment, PAYMENT_STATUSES, MAXIMUM_COMMENT_LENGTH } = require('../models/Payment');
const { Member } = require('../models/Member');
const { Membership } = require('../models/Membership');
const { Plan, PLAN_KEYS } = require('../models/Plan');
const { AuditEntry, AUDIT_ACTIONS } = require('../models/AuditEntry');
const { FILE_PURPOSES } = require('../config/fileStorage');
const { PAYMENT_FREQUENCIES, lastValidDay } = require('../config/chamberCalendar');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { refuse } = require('../config/memberRules');
const { readPagination, paginated } = require('../config/pagination');
const clock = require('../config/clock');
const fileStorageService = require('./fileStorageService');
const emailService = require('./emailService');
const membershipPolicyService = require('./membershipPolicyService');
const { normalizeMemberCode } = require('./memberCodeService');
const { RENEWAL_FREQUENCY, renewalWindow } = require('./renewalPolicy');
const notificationService = require('./notificationService');
const { NOTIFICATION_TYPES } = require('../models/Notification');

const PAID_PLAN_KEYS = [PLAN_KEYS.LITE, PLAN_KEYS.PRO, PLAN_KEYS.PREMIUM];
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DUPLICATE_KEY = 11000;
const LIST_STATUSES = Object.values(PAYMENT_STATUSES);

// The detail written on the transfer: the member code with no dashes, then the
// word that says what it pays for. Short enough for SINPE Móvil's limit.
function referenceFor(memberCode) {
  return `${normalizeMemberCode(memberCode) ?? memberCode} Membresia`;
}

function formatColones(amount) {
  return `₡${String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function conflict(code, message, details = {}) {
  return new ApplicationError(code, message, { statusCode: 409, ...details });
}

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'There is no such payment.', {
    statusCode: 404,
  });
}

function readObjectId(value, field) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    refuse(ERROR_CODES.INVALID_FORMAT, field, `The ${field} is not a valid reference.`);
  }

  return value;
}

// Everything the member sends is checked before anything is stored, so a
// request that was never going to be accepted leaves no file behind.
function readPaymentRequest(body) {
  const plan = body?.plan;

  if (typeof plan !== 'string' || !PAID_PLAN_KEYS.includes(plan)) {
    refuse(ERROR_CODES.INVALID_FORMAT, 'plan', 'The plan is one of the paid plans.');
  }

  let comment = null;

  if (body.comment !== undefined && body.comment !== '') {
    if (typeof body.comment !== 'string') {
      refuse(ERROR_CODES.NOT_TEXT, 'comment', 'The comment is text.');
    }

    comment = body.comment.trim();

    if (comment.length > MAXIMUM_COMMENT_LENGTH) {
      refuse(
        ERROR_CODES.TOO_LONG,
        'comment',
        `The comment is at most ${MAXIMUM_COMMENT_LENGTH} characters.`,
      );
    }

    comment = comment === '' ? null : comment;
  }

  const resubmissionOf =
    body.resubmissionOf === undefined || body.resubmissionOf === ''
      ? null
      : readObjectId(body.resubmissionOf, 'resubmissionOf');

  return { plan, comment, resubmissionOf };
}

function readReceipt(file) {
  if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) {
    refuse(ERROR_CODES.REQUIRED, 'receipt', 'The receipt is required.');
  }

  return file;
}

function presentTerm(term) {
  return term === null || term === undefined
    ? null
    : {
        startsAt: term.startsAt,
        expiresAt: term.expiresAt,
        validUntil: lastValidDay(term.expiresAt),
      };
}

// What a member reads of their own payment. The storage key is not among it:
// the receipt is opened through its payment.
function presentPayment(payment) {
  return {
    id: String(payment._id),
    plan: { key: payment.planKey, name: payment.planName },
    monthlyFee: payment.monthlyFee,
    months: payment.months,
    frequency: payment.frequency,
    amount: payment.amount,
    reference: payment.reference,
    receipt: { contentType: payment.receipt.contentType, size: payment.receipt.size },
    comment: payment.comment ?? null,
    resubmissionOf: payment.resubmissionOf === null ? null : String(payment.resubmissionOf),
    status: payment.status,
    submittedAt: payment.submittedAt,
    decidedAt: payment.decidedAt ?? null,
    decidedBy: payment.decidedBy?.name ?? null,
    rejectionReason: payment.rejectionReason ?? null,
    term: presentTerm(payment.term),
  };
}

const defaultPaymentStore = {
  notifyAdmins: (type, params) => notificationService.notifyAdmins(type, params),
  findMember: (memberId) =>
    Member.findById(memberId).select('businessName email memberCode').lean(),
  findMembership: (memberId) =>
    Membership.findOne({ member: memberId }).populate('plan', 'key name').lean(),
  readNoticeDays: () => membershipPolicyService.readNoticeDays(),
  findPendingPayment: (memberId) =>
    Payment.findOne({ member: memberId, status: PAYMENT_STATUSES.PENDING_REVIEW })
      .select('_id')
      .lean(),
  findApprovedReceipt: (sha256) =>
    Payment.exists({ 'receipt.sha256': sha256, status: PAYMENT_STATUSES.APPROVED }),
  findRejectedPayment: (paymentId, memberId) =>
    Payment.exists({ _id: paymentId, member: memberId, status: PAYMENT_STATUSES.REJECTED }),
  findPlan: (key) => Plan.findOne({ key }).select('key name monthlyFee').lean(),
  storeReceipt: (memberId, file) =>
    fileStorageService.uploadFile(
      {
        purpose: FILE_PURPOSES.PAYMENT_RECEIPT,
        ownerId: memberId,
        contentType: file.mimetype,
        content: file.buffer,
      },
      undefined,
      undefined,
      [FILE_PURPOSES.PAYMENT_RECEIPT],
    ),

  deleteReceipt: (key) => fileStorageService.deleteFile(key),

  // The payment and its audit entry are written together or not at all.
  createPayment: (document, auditEntry) =>
    mongoose.connection.transaction(async (session) => {
      const [created] = await Payment.create([document], { session });

      await AuditEntry.insertMany(
        [{ ...auditEntry, subject: { ...auditEntry.subject, id: created._id } }],
        {
          session,
        },
      );

      return created.toObject();
    }),
  findPayments: (filter, { skip, pageSize }) =>
    Payment.find(filter).sort({ submittedAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
  countPayments: (filter) => Payment.countDocuments(filter),
  findOwnPayment: (paymentId, memberId) =>
    Payment.findOne({ _id: paymentId, member: memberId }).lean(),
};

async function readMember(memberId, store) {
  const member = await store.findMember(memberId);

  if (member === null || member === undefined) {
    throw new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'That account no longer exists.', {
      statusCode: 404,
    });
  }

  return member;
}

// Whether the member may register a payment now, and if not, why and from
// when. The screen asks before showing the form; the API asks again on submit.
async function readEligibility(memberId, store = defaultPaymentStore, now = clock.now()) {
  const [member, membership, noticeDays, pending] = await Promise.all([
    readMember(memberId, store),
    store.findMembership(memberId),
    store.readNoticeDays(),
    store.findPendingPayment(memberId),
  ]);
  const window = renewalWindow(membership, now, noticeDays);

  let reason = null;

  if (pending !== null && pending !== undefined) {
    reason = ERROR_CODES.PAYMENT_PENDING;
  } else if (!window.open) {
    reason = ERROR_CODES.RENEWAL_NOT_OPEN;
  }

  return {
    canSubmit: reason === null,
    reason,
    opensOn: window.opensOn,
    pendingPaymentId: pending === null || pending === undefined ? null : String(pending._id),
    reference: referenceFor(member.memberCode),
  };
}

async function submitPayment(
  memberId,
  body,
  file,
  store = defaultPaymentStore,
  notify = emailService.notify,
  now = clock.now(),
) {
  const request = readPaymentRequest(body);
  const receipt = readReceipt(file);
  const eligibility = await readEligibility(memberId, store, now);

  if (eligibility.reason === ERROR_CODES.PAYMENT_PENDING) {
    throw conflict(ERROR_CODES.PAYMENT_PENDING, 'A payment is already waiting for review.');
  }

  if (eligibility.reason === ERROR_CODES.RENEWAL_NOT_OPEN) {
    throw conflict(ERROR_CODES.RENEWAL_NOT_OPEN, 'The plan cannot be renewed yet.', {
      field: 'plan',
      reason: eligibility.opensOn,
    });
  }

  if (
    request.resubmissionOf !== null &&
    !(await store.findRejectedPayment(request.resubmissionOf, memberId))
  ) {
    refuse(
      ERROR_CODES.UNKNOWN_REFERENCE,
      'resubmissionOf',
      'There is no rejected payment of yours with that reference.',
    );
  }

  const sha256 = createHash('sha256').update(receipt.buffer).digest('hex');

  if (await store.findApprovedReceipt(sha256)) {
    throw conflict(
      ERROR_CODES.RECEIPT_ALREADY_USED,
      'This receipt already paid for another term.',
      {
        field: 'receipt',
      },
    );
  }

  const plan = await store.findPlan(request.plan);

  if (plan === null || plan === undefined) {
    throw new ApplicationError(ERROR_CODES.INTERNAL_ERROR, 'The plans have not been seeded.', {
      statusCode: 500,
    });
  }

  const member = await readMember(memberId, store);
  const stored = await store.storeReceipt(memberId, receipt);
  const months = PAYMENT_FREQUENCIES[RENEWAL_FREQUENCY];

  let payment;

  try {
    payment = await store.createPayment(
      {
        member: memberId,
        plan: plan._id,
        planKey: plan.key,
        planName: plan.name,
        monthlyFee: plan.monthlyFee,
        months,
        frequency: RENEWAL_FREQUENCY,
        amount: plan.monthlyFee * months,
        reference: referenceFor(member.memberCode),
        receipt: stored,
        comment: request.comment,
        resubmissionOf: request.resubmissionOf,
        status: PAYMENT_STATUSES.PENDING_REVIEW,
        submittedAt: now,
      },
      {
        action: AUDIT_ACTIONS.PAYMENT_SUBMITTED,
        actor: { id: member._id, role: 'member', name: member.businessName },
        subject: { type: 'Payment', label: member.businessName },
        changes: [
          { field: 'plan', before: null, after: plan.key },
          { field: 'amount', before: null, after: plan.monthlyFee * months },
        ],
      },
    );
  } catch (error) {
    // The receipt was stored for a payment that does not exist. It is nobody's
    // record, so it goes rather than sit in the bucket unreferenced.
    await store.deleteReceipt(stored.key).catch(() => {});

    // Two submissions at once both passed the check above; the index let one in.
    if (error.code === DUPLICATE_KEY) {
      throw conflict(ERROR_CODES.PAYMENT_PENDING, 'A payment is already waiting for review.');
    }

    throw error;
  }

  const notified = await notify('paymentReceived', member.email, {
    businessName: member.businessName,
    planName: plan.name,
    amount: formatColones(payment.amount),
    reference: payment.reference,
  });

  await store.notifyAdmins(NOTIFICATION_TYPES.PAYMENT_SUBMITTED, {
    businessName: member.businessName,
    amount: payment.amount,
  });

  return { ...presentPayment(payment), notified };
}

async function listOwnPayments(memberId, query, store = defaultPaymentStore) {
  const pagination = readPagination(query);
  const status = query?.status;
  const filter = { member: memberId };

  if (status !== undefined && status !== '') {
    if (typeof status !== 'string' || !LIST_STATUSES.includes(status)) {
      refuse(ERROR_CODES.INVALID_FORMAT, 'status', `status is one of ${LIST_STATUSES.join(', ')}.`);
    }

    filter.status = status;
  }

  const [payments, total] = await Promise.all([
    store.findPayments(filter, pagination),
    store.countPayments(filter),
  ]);

  return paginated(payments.map(presentPayment), total, pagination);
}

// A payment that is not the member's answers as if it did not exist.
async function readOwnPaymentRecord(memberId, paymentId, store) {
  if (typeof paymentId !== 'string' || !OBJECT_ID.test(paymentId)) {
    throw notFound();
  }

  const payment = await store.findOwnPayment(paymentId, memberId);

  if (payment === null || payment === undefined) {
    throw notFound();
  }

  return payment;
}

async function readOwnPayment(memberId, paymentId, store = defaultPaymentStore) {
  return presentPayment(await readOwnPaymentRecord(memberId, paymentId, store));
}

async function readOwnReceiptKey(memberId, paymentId, store = defaultPaymentStore) {
  return (await readOwnPaymentRecord(memberId, paymentId, store)).receipt.key;
}

module.exports = {
  PAID_PLAN_KEYS,
  referenceFor,
  formatColones,
  presentPayment,
  readPaymentRequest,
  readEligibility,
  submitPayment,
  listOwnPayments,
  readOwnPayment,
  readOwnReceiptKey,
};
