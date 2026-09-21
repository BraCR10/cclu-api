const mongoose = require('mongoose');

// One document per configurable value the chamber owns. Today that is only the
// monthly fee; a second setting is a second key, not a second collection.
const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    amount: {
      type: Number,
      min: 0,
    },
  },
  { timestamps: true },
);

const SETTING_KEYS = {
  MONTHLY_FEE: 'monthly-fee',
};

const Setting = mongoose.model('Setting', settingSchema);

module.exports = { Setting, SETTING_KEYS };
