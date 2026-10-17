const mongoose = require('mongoose');

const MEMBERSHIP_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

// The paid plan that ran out, kept until the next one is approved. It is what
// tells the member why they are on Gratuita, and what the panel lists as
// expired.
const lapseSchema = new mongoose.Schema(
  {
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    expiredAt: { type: Date, required: true },
  },
  { _id: false },
);

// A member is always on some plan. What the plan allows lives on the plan, so
// this only records which one and until when. It is the current state, one per
// member; what happened before lives in the audit log.
const membershipSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      unique: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(MEMBERSHIP_STATUSES),
      default: MEMBERSHIP_STATUSES.ACTIVE,
    },
    // When the current plan began: the approval of the application on
    // Gratuita, the approval of the payment on a paid plan.
    startedAt: {
      type: Date,
      required: true,
    },
    // Null on Gratuita, which never runs out.
    expiresAt: {
      type: Date,
      default: null,
    },
    lapsed: {
      type: lapseSchema,
      default: null,
    },
    // The expiry the reminder was already sent for. Compared with expiresAt,
    // so a renewal that moves the date makes the next reminder due again.
    reminderSentFor: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

membershipSchema.index({ expiresAt: 1 });

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = { Membership, MEMBERSHIP_STATUSES };
