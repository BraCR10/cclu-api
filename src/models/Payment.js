const mongoose = require('mongoose');
const { PAYMENT_FREQUENCIES } = require('../config/chamberCalendar');

const PAYMENT_STATUSES = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const MAXIMUM_COMMENT_LENGTH = 300;
const REJECTION_REASON_LENGTH = Object.freeze({ MINIMUM: 10, MAXIMUM: 300 });

const receiptSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
  },
  { _id: false },
);

const deciderSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

// The period an approval granted, kept with the payment that paid for it.
const termSchema = new mongoose.Schema(
  {
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

// A payment is a financial record. What was asked for is copied in when it is
// submitted, so a fee changed afterwards never changes what was paid, and the
// record is decided once and then only read.
const paymentSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    planKey: { type: String, required: true },
    planName: { type: String, required: true },
    monthlyFee: { type: Number, required: true, min: 0 },
    months: { type: Number, required: true, min: 1 },
    frequency: { type: String, required: true, enum: Object.keys(PAYMENT_FREQUENCIES) },
    amount: { type: Number, required: true, min: 0 },
    // The detail the member writes on the transfer, so the chamber can match
    // the money to the request.
    reference: { type: String, required: true },
    receipt: { type: receiptSchema, required: true },
    comment: { type: String, default: null, maxlength: MAXIMUM_COMMENT_LENGTH },
    // The rejected payment this one answers, when the member sends it again.
    resubmissionOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    status: {
      type: String,
      required: true,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.PENDING_REVIEW,
    },
    submittedAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: deciderSchema, default: null },
    rejectionReason: { type: String, default: null, maxlength: REJECTION_REASON_LENGTH.MAXIMUM },
    term: { type: termSchema, default: null },
  },
  { versionKey: false },
);

paymentSchema.index({ member: 1, submittedAt: -1 });
paymentSchema.index({ status: 1, submittedAt: 1 });
paymentSchema.index({ 'receipt.sha256': 1, status: 1 });

// The database itself refuses a second pending payment for the same member, so
// two requests arriving together cannot both get in.
paymentSchema.index(
  { member: 1 },
  {
    unique: true,
    partialFilterExpression: { status: PAYMENT_STATUSES.PENDING_REVIEW },
    name: 'one_pending_payment_per_member',
  },
);

const DECISION_FIELDS = new Set(['status', 'decidedAt', 'decidedBy', 'rejectionReason', 'term']);

function refuseRewrite() {
  throw new Error('A payment is decided once and is otherwise never changed or removed.');
}

// The one change a payment allows: leaving pending review, with its decision.
// An update has to name the pending state in its filter and set only the
// decision fields, so nothing else on the record can ever be rewritten.
function allowOnlyTheDecision() {
  const filter = this.getFilter();
  const update = this.getUpdate() ?? {};
  const operators = Object.keys(update);
  const setFields = Object.keys(update.$set ?? {});

  const decidesPending =
    filter.status === PAYMENT_STATUSES.PENDING_REVIEW &&
    operators.length === 1 &&
    operators[0] === '$set' &&
    setFields.length > 0 &&
    setFields.every((field) => DECISION_FIELDS.has(field)) &&
    [PAYMENT_STATUSES.APPROVED, PAYMENT_STATUSES.REJECTED].includes(update.$set.status);

  if (!decidesPending) {
    refuseRewrite();
  }
}

paymentSchema.pre(
  ['updateOne', 'findOneAndUpdate'],
  { document: false, query: true },
  allowOnlyTheDecision,
);

paymentSchema.pre(
  ['updateMany', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  { document: true, query: true },
  refuseRewrite,
);

paymentSchema.pre('bulkWrite', function refuseBulkRewrite(operations) {
  if (operations.some((operation) => !('insertOne' in operation))) {
    refuseRewrite();
  }
});

paymentSchema.pre('save', function refuseResave() {
  if (!this.isNew) {
    refuseRewrite();
  }
});

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = {
  Payment,
  PAYMENT_STATUSES,
  MAXIMUM_COMMENT_LENGTH,
  REJECTION_REASON_LENGTH,
};
