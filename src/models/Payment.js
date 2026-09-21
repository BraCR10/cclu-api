const mongoose = require('mongoose');

const PAYMENT_STATUSES = {
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const paymentSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    // The stored key of the receipt, never an address: a signed URL expires,
    // the key does not. Same arrangement as Member.logoKey.
    receiptKey: {
      type: String,
      required: true,
      trim: true,
    },
    paidAt: {
      type: Date,
      required: true,
    },
    detail: {
      type: String,
      trim: true,
    },
    // Copied from the configured fee at registration time, so a later change
    // of the fee does not rewrite what this member was asked to pay.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.PENDING_REVIEW,
    },
    statusReason: {
      type: String,
      trim: true,
    },
    // Who decided and when. A payment record that cannot answer that a year
    // later is what BD-003 exists to prevent.
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ member: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = { Payment, PAYMENT_STATUSES };
