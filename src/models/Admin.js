const mongoose = require('mongoose');
const { ADMIN_ACCOUNT_STATUSES } = require('../config/accountStatus');

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
      enum: Object.values(ADMIN_ACCOUNT_STATUSES),
      default: ADMIN_ACCOUNT_STATUSES.ACTIVE,
    },
    // When an invitation stops being usable. Read rather than trusted, so a
    // state that was written as pending answers as expired once the moment has
    // passed.
    invitationExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Admin = mongoose.model('Admin', adminSchema);

module.exports = { Admin };
