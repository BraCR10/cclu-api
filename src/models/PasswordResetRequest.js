const mongoose = require('mongoose');
const { ROLES } = require('../config/roles');

const passwordResetRequestSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, required: true, enum: Object.values(ROLES) },

    // A digest rather than the token, so a copy of this collection opens
    // nothing. There is no attempt counter beside it: the token is 256 random
    // bits and there is nothing to guess, which is what a six digit code could
    // not say for itself.
    tokenDigest: { type: String, required: true },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// What makes the lookup by digest a lookup rather than a scan, and refuses two
// requests that somehow produced the same token.
passwordResetRequestSchema.index({ tokenDigest: 1 }, { unique: true });

// One open request per account. Asking again replaces the previous link rather
// than leaving two that both work.
passwordResetRequestSchema.index({ account: 1, role: 1 }, { unique: true });

// The database removes the document once it expires, so an unused link does not
// sit around waiting to be found.
passwordResetRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetRequest = mongoose.model('PasswordResetRequest', passwordResetRequestSchema);

module.exports = { PasswordResetRequest };
