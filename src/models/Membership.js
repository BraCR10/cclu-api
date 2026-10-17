const mongoose = require('mongoose');

const MEMBERSHIP_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

// A member is always on some plan. What the plan allows lives on the plan, so
// this only records which one and until when.
const membershipSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
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
    // Null on Gratuita, which never runs out.
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = { Membership, MEMBERSHIP_STATUSES };
