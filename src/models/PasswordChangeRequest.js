const mongoose = require('mongoose');
const { ROLES } = require('../config/roles');

const passwordChangeRequestSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, required: true, enum: Object.values(ROLES) },

    // The code is a credential for as long as it lives, so it is stored the
    // same way a password is and never in the clear.
    codeHash: { type: String, required: true },

    attempts: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One open request per account. Asking again replaces the previous code rather
// than leaving two that both work.
passwordChangeRequestSchema.index({ account: 1, role: 1 }, { unique: true });

// The database removes the document once it expires, so an unused code does not
// sit around waiting to be guessed.
passwordChangeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordChangeRequest = mongoose.model('PasswordChangeRequest', passwordChangeRequestSchema);

module.exports = { PasswordChangeRequest };
