const mongoose = require('mongoose');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');

const adminSchema = new mongoose.Schema(
  {
    // Optional, because administrators created before this field existed have
    // none and refusing to load them would lock the chamber out of its own
    // panel. Everything that reads it falls back to the address.
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    accountStatus: {
      type: String,
      required: true,
      enum: Object.values(ACCOUNT_STATUSES),
      default: ACCOUNT_STATUSES.ACTIVE,
    },
  },
  { timestamps: true },
);

const Admin = mongoose.model('Admin', adminSchema);

module.exports = { Admin };
