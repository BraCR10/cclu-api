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
    // Set when the administrator is invited to join. See [RF-ADM-009] Gestión de administradores
    // Before the invitation is accepted the account is suspended, so the only way in is the link that
    // carries this token. Both are cleared once the administrator sets a password.
    invitationTokenHash: {
      type: String,
    },
    invitationExpiresAt: {
      type: Date,
    },
    invitedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { timestamps: true },
);

// Looked up by this digest when somebody follows their invitation link, so it
// is indexed and sparse: only an invited administrator carries one.
adminSchema.index({ invitationTokenHash: 1 }, { sparse: true });

const Admin = mongoose.model('Admin', adminSchema);

module.exports = { Admin };
