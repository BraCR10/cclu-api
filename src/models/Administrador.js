const mongoose = require('mongoose');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');

const administradorSchema = new mongoose.Schema(
  {
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
      default: ACCOUNT_STATUSES.ACTIVA,
    },
  },
  { timestamps: true },
);

const Administrador = mongoose.model('Administrador', administradorSchema);

module.exports = { Administrador };
