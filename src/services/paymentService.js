const { Payment, PAYMENT_STATUSES } = require('../models/Payment');
const { Member, APPLICATION_STATUSES } = require('../models/Member');
const { Admin } = require('../models/Admin');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');
const { FILE_PURPOSES } = require('../config/fileStorage');
const { ValidationError, refuse, CODES, PATTERNS } = require('../config/memberRules');
const { uploadImage } = require('./imageUploadService');
const { createDownloadUrl } = require('./fileStorageService');
const { findFeeSetting, hasPaidMembership, MEMBERSHIP_TYPES } = require('./membershipService');
const emailService = require('./emailService');

const DETAIL_MAX = 500;
const REASON_MAX = 500;

function readPaidAt(body) {
  const value = body.paidAt;
  const paidAt = typeof value === 'string' || value instanceof Date ? new Date(value) : null;

  if (paidAt === null || Number.isNaN(paidAt.getTime())) {
    refuse(CODES.INVALID_FORMAT, 'paidAt', 'The field paidAt is not a valid date.');
  }

  return paidAt;
}

function readDetail(body) {
  const value = body.detail;

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    refuse(CODES.NOT_TEXT, 'detail', 'The field detail must be text.');
  }

  const trimmed = value.trim();

  if (trimmed === '') {
    return undefined;
  }

  if (trimmed.length > DETAIL_MAX) {
    refuse(CODES.TOO_LONG, 'detail', `The field detail is longer than ${DETAIL_MAX}.`);
  }

  return trimmed;
}

function requireBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    refuse(CODES.BODY_MISSING, null, 'The payment body is missing.');
  }

  return body;
}

// One shape wherever a payment is read: by its owner, or by the administrator
// deciding on it. The receipt travels as a short-lived signed address.
async function presentPayment(payment, sign = createDownloadUrl) {
  return {
    id: String(payment._id),
    paidAt: payment.paidAt,
    detail: payment.detail ?? null,
    amount: payment.amount,
    status: payment.status,
    statusReason: payment.statusReason ?? null,
    reviewedAt: payment.reviewedAt ?? null,
    receiptUrl: await sign(payment.receiptKey),
    createdAt: payment.createdAt,
  };
}

function findActiveAdminEmails() {
  return Admin.find({ accountStatus: ACCOUNT_STATUSES.ACTIVE }).select('email').lean();
}

function findMemberBusinessName(memberId) {
  return Member.findById(memberId).select('businessName email').lean();
}

function savePayment(fields) {
  return Payment.create(fields).then((created) => created.toObject());
}

async function registerPayment(
  memberId,
  rawBody,
  findFee = findFeeSetting,
  upload = uploadImage,
  save = savePayment,
  findMember = findMemberBusinessName,
  findAdmins = findActiveAdminEmails,
  notify = emailService.notify,
  sign = createDownloadUrl,
) {
  const body = requireBody(rawBody);
  const paidAt = readPaidAt(body);
  const detail = readDetail(body);

  // The fee is what the member is being asked to pay; without one configured
  // there is no amount to record and the registration cannot mean anything.
  const fee = await findFee();

  if (fee === null || fee === undefined || typeof fee.amount !== 'number') {
    refuse(CODES.FEE_NOT_CONFIGURED, null, 'The monthly fee has not been configured yet.');
  }

  const { key } = await upload({
    purpose: FILE_PURPOSES.PAYMENT_RECEIPT,
    ownerId: memberId,
    contentType: body.contentType,
    base64: body.content,
  });

  const created = await save({
    member: memberId,
    receiptKey: key,
    paidAt,
    detail,
    amount: fee.amount,
  });

  // The payment is already registered; the notice beside it is reported when it
  // does not leave, never undone.
  const member = await findMember(memberId);
  const admins = await findAdmins();

  for (const admin of admins) {
    await notify('paymentSubmitted', admin.email, {
      businessName: member?.businessName ?? 'Un agremiado',
    });
  }

  return presentPayment(created, sign);
}

function findOwnPayments(memberId) {
  return Payment.find({ member: memberId }).sort({ createdAt: -1 }).lean();
}

async function listOwnPayments(memberId, find = findOwnPayments, sign = createDownloadUrl) {
  const payments = await find(memberId);

  return Promise.all(payments.map((payment) => presentPayment(payment, sign)));
}

// The oldest pending payment is decided first, the same order applications are.
function findPendingPayments() {
  return Payment.find({ status: PAYMENT_STATUSES.PENDING_REVIEW })
    .populate('member', 'businessName memberCode email')
    .sort({ createdAt: 1 })
    .lean();
}

async function listPendingPayments(find = findPendingPayments, sign = createDownloadUrl) {
  const payments = await find();

  return Promise.all(
    payments.map(async (payment) => ({
      ...(await presentPayment(payment, sign)),
      member:
        payment.member !== null && typeof payment.member === 'object'
          ? {
              id: String(payment.member._id),
              businessName: payment.member.businessName,
              memberCode: payment.member.memberCode ?? null,
              email: payment.member.email,
            }
          : null,
    })),
  );
}

function readPaymentId(value) {
  if (typeof value !== 'string' || !PATTERNS.objectId.test(value)) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That payment no longer exists.', 404);
  }

  return value;
}

// The expected state travels inside the filter, so two administrators deciding
// at once cannot both succeed.
function decidePendingPayment(paymentId, changes) {
  return Payment.findOneAndUpdate(
    { _id: paymentId, status: PAYMENT_STATUSES.PENDING_REVIEW },
    changes,
    { returnDocument: 'after', runValidators: true },
  ).lean();
}

function findPaymentStatus(paymentId) {
  return Payment.findById(paymentId).select('status').lean();
}

async function refuseDecision(paymentId, findStatus) {
  const existing = await findStatus(paymentId);

  if (existing === null || existing === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That payment no longer exists.', 404);
  }

  const error = new ValidationError(
    CODES.NOT_ALLOWED,
    null,
    'This payment was already decided.',
    409,
  );
  error.reason = existing.status;

  throw error;
}

// One month counted from the approval, never from the transfer: the membership
// the chamber grants starts the moment somebody vouched for the receipt.
function oneMonthAfter(date) {
  const until = new Date(date);
  until.setMonth(until.getMonth() + 1);

  return until;
}

function savePaidUntil(memberId, paidUntil) {
  return Member.findByIdAndUpdate(memberId, { $set: { paidUntil } });
}

async function approvePayment(
  paymentId,
  reviewerId,
  decide = decidePendingPayment,
  findStatus = findPaymentStatus,
  saveUntil = savePaidUntil,
  findMember = findMemberBusinessName,
  notify = emailService.notify,
) {
  const id = readPaymentId(paymentId);
  const reviewedAt = new Date();

  const approved = await decide(id, {
    $set: {
      status: PAYMENT_STATUSES.APPROVED,
      reviewedBy: reviewerId,
      reviewedAt,
    },
    $unset: { statusReason: '' },
  });

  if (approved === null || approved === undefined) {
    await refuseDecision(id, findStatus);
  }

  const paidUntil = oneMonthAfter(reviewedAt);
  await saveUntil(approved.member, paidUntil);

  const member = await findMember(approved.member);

  if (member !== null && member !== undefined) {
    await notify('paymentApproved', member.email, {
      businessName: member.businessName,
      paidUntil,
    });
  }

  return { id: String(approved._id), status: PAYMENT_STATUSES.APPROVED, paidUntil };
}

function readReason(body) {
  const reason = body === null || typeof body !== 'object' ? undefined : body.reason;

  if (typeof reason !== 'string' || reason.trim() === '') {
    refuse(CODES.REQUIRED, 'reason', 'A reason is required to reject a payment.');
  }

  const trimmed = reason.trim();

  if (trimmed.length > REASON_MAX) {
    refuse(CODES.TOO_LONG, 'reason', `The field reason is longer than ${REASON_MAX}.`);
  }

  return trimmed;
}

async function rejectPayment(
  paymentId,
  reviewerId,
  body,
  decide = decidePendingPayment,
  findStatus = findPaymentStatus,
  findMember = findMemberBusinessName,
  notify = emailService.notify,
) {
  const id = readPaymentId(paymentId);
  const reason = readReason(body);

  const rejected = await decide(id, {
    $set: {
      status: PAYMENT_STATUSES.REJECTED,
      statusReason: reason,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
  });

  if (rejected === null || rejected === undefined) {
    await refuseDecision(id, findStatus);
  }

  const member = await findMember(rejected.member);

  if (member !== null && member !== undefined) {
    await notify('paymentRejected', member.email, {
      businessName: member.businessName,
      reason,
    });
  }

  return { id: String(rejected._id), status: PAYMENT_STATUSES.REJECTED };
}

function findMemberById(memberId) {
  return Member.findById(memberId).select('_id').lean();
}

async function listMemberPayments(
  memberId,
  findMember = findMemberById,
  find = findOwnPayments,
  sign = createDownloadUrl,
) {
  if (typeof memberId !== 'string' || !PATTERNS.objectId.test(memberId)) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  const member = await findMember(memberId);

  if (member === null || member === undefined) {
    throw new ValidationError(CODES.UNKNOWN_REFERENCE, null, 'That account no longer exists.', 404);
  }

  const payments = await find(memberId);

  return Promise.all(payments.map((payment) => presentPayment(payment, sign)));
}

const MEMBERSHIP_FIELDS = 'businessName memberCode email paidUntil';

function findApprovedMembers() {
  return Member.find({ applicationStatus: APPLICATION_STATUSES.APPROVED })
    .select(MEMBERSHIP_FIELDS)
    .populate('canton', 'name')
    .populate('sector', 'name')
    .sort({ businessName: 1 })
    .lean();
}

const MEMBERSHIP_STATES = { ACTIVE: 'active', INACTIVE: 'inactive' };

async function listMemberships(query, find = findApprovedMembers, now = () => new Date()) {
  const members = await find();

  const rows = members.map((member) => {
    const paid = hasPaidMembership(member, now);

    return {
      member: {
        id: String(member._id),
        businessName: member.businessName,
        memberCode: member.memberCode ?? null,
        email: member.email,
        canton: member.canton?.name ?? null,
        sector: member.sector?.name ?? null,
      },
      type: paid ? MEMBERSHIP_TYPES.PAID : MEMBERSHIP_TYPES.FREE,
      paidUntil: paid ? member.paidUntil : null,
    };
  });

  const state = query?.state;

  if (state === MEMBERSHIP_STATES.ACTIVE) {
    return rows.filter((row) => row.type === MEMBERSHIP_TYPES.PAID);
  }

  if (state === MEMBERSHIP_STATES.INACTIVE) {
    return rows.filter((row) => row.type === MEMBERSHIP_TYPES.FREE);
  }

  return rows;
}

module.exports = {
  registerPayment,
  listOwnPayments,
  listPendingPayments,
  approvePayment,
  rejectPayment,
  listMemberPayments,
  listMemberships,
};
