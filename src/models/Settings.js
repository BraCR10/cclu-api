const mongoose = require('mongoose');

const MEMBERSHIP_POLICY_KEY = 'membership';

// At most 27 days, one less than the shortest month. The renewal window opens
// this many days before an expiry, and a renewal adds a month; were the notice
// longer than a month, the next window would already be open when the renewal
// is approved, and one term could be paid for twice.
const NOTICE_DAYS = Object.freeze({ DEFAULT: 7, MINIMUM: 1, MAXIMUM: 27 });

// The rules about memberships the chamber sets from the panel, kept as one
// document. How many days before an expiry the member is reminded, and the
// panel lists the plan as expiring soon, is one value so the two never
// disagree.
const membershipPolicySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      enum: [MEMBERSHIP_POLICY_KEY],
    },
    expiryNoticeDays: {
      type: Number,
      required: true,
      min: NOTICE_DAYS.MINIMUM,
      max: NOTICE_DAYS.MAXIMUM,
      validate: { validator: Number.isInteger, message: 'The notice is whole days.' },
    },
  },
  { timestamps: true },
);

const MembershipPolicy = mongoose.model('MembershipPolicy', membershipPolicySchema);

module.exports = { MembershipPolicy, MEMBERSHIP_POLICY_KEY, NOTICE_DAYS };
