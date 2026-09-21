const mongoose = require('mongoose');
const { ADMIN_STATUSES } = require('../config/adminStatus');

const promotionSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    conditions: {
      type: String,
      required: true,
      trim: true,
    },
    // Until when the promotion stands. Expiry is computed at read time against
    // this date, so nothing has to run at midnight to turn promotions off.
    validUntil: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    adminStatus: {
      type: String,
      required: true,
      enum: Object.values(ADMIN_STATUSES),
      default: ADMIN_STATUSES.ACTIVE,
    },
  },
  { timestamps: true },
);

promotionSchema.index({ member: 1 });
promotionSchema.index({ isActive: 1, adminStatus: 1, validUntil: 1, createdAt: -1 });

const Promotion = mongoose.model('Promotion', promotionSchema);

module.exports = { Promotion };
