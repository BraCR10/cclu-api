const mongoose = require('mongoose');

const PLAN_KEYS = {
  FREE: 'free',
  LITE: 'lite',
  PRO: 'pro',
  PREMIUM: 'premium',
};

const BANNER_ALLOWANCES = {
  NONE: 'none',
  ONE_MONTH: 'one_month',
  UNLIMITED: 'unlimited',
};

// What a plan lets a member do. Screens and services ask these flags rather
// than comparing plan names, so renaming a plan never changes what it unlocks.
// Being listed in the directory and holding a digital card come with every
// plan, so they are not stored.
const entitlementsSchema = new mongoose.Schema(
  {
    publishInMarketplace: { type: Boolean, required: true },
    publishJobs: { type: Boolean, required: true },
    banner: {
      type: String,
      required: true,
      enum: Object.values(BANNER_ALLOWANCES),
    },
    onlineWorkshops: { type: Boolean, required: true },
    massMailing: { type: Boolean, required: true },
  },
  { _id: false },
);

const planSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      enum: Object.values(PLAN_KEYS),
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: Number,
      required: true,
    },
    // Whole colones. The chamber never charges fractions, and an integer keeps
    // a sum from drifting.
    monthlyFee: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'The fee is whole colones.' },
    },
    entitlements: {
      type: entitlementsSchema,
      required: true,
    },
  },
  { timestamps: true },
);

const Plan = mongoose.model('Plan', planSchema);

module.exports = { Plan, PLAN_KEYS, BANNER_ALLOWANCES };
