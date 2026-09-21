const mongoose = require('mongoose');

const MEMBERSHIP_TYPES = {
  FREE: 'free',
  PAID: 'paid',
};

const MEMBERSHIP_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  TERMINATED: 'terminated',
};

const membershipSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(MEMBERSHIP_TYPES),
      default: MEMBERSHIP_TYPES.FREE,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(MEMBERSHIP_STATUSES),
      default: MEMBERSHIP_STATUSES.ACTIVE,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = { Membership, MEMBERSHIP_TYPES, MEMBERSHIP_STATUSES };
