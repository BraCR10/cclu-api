const mongoose = require('mongoose');

const MEMBRESIA_TYPES = {
  GRATUITA: 'gratuita',
  PAGADA: 'pagada',
};

const MEMBRESIA_STATUSES = {
  ACTIVA: 'activa',
  NO_ACTIVA: 'no activa',
};

const membresiaSchema = new mongoose.Schema(
  {
    agremiado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agremiado',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(MEMBRESIA_TYPES),
      default: MEMBRESIA_TYPES.GRATUITA,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(MEMBRESIA_STATUSES),
      default: MEMBRESIA_STATUSES.ACTIVA,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Membresia = mongoose.model('Membresia', membresiaSchema);

module.exports = { Membresia, MEMBRESIA_TYPES, MEMBRESIA_STATUSES };
