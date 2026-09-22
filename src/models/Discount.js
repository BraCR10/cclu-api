const mongoose = require('mongoose');
const { ADMIN_STATUSES } = require('../config/adminStatus');

// A benefit one affiliate offers the others. It has no title of its own: the
// ERS defines it by its description, validity and conditions.
const discountSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
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

discountSchema.index({ member: 1 });
discountSchema.index({ isActive: 1, adminStatus: 1, validUntil: 1, createdAt: -1 });

const Discount = mongoose.model('Discount', discountSchema);

module.exports = { Discount };
