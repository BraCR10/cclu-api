const mongoose = require('mongoose');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');

const AGREMIADO_TYPES = {
  COMERCIO: 'comercio',
  PROFESIONAL_INDEPENDIENTE: 'profesional independiente',
};

const IDENTIFICATION_TYPES = {
  CEDULA_FISICA: 'cédula física',
  CEDULA_JURIDICA: 'cédula jurídica',
  PASAPORTE: 'pasaporte',
  DIMEX: 'dimex',
};

const APPLICATION_STATUSES = {
  PENDING_REVIEW: 'pendiente de revisión',
  CHANGES_REQUESTED: 'cambios solicitados',
  APPROVED: 'aprobada',
  REJECTED: 'rechazada',
};

const agremiadoSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    canton: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Canton',
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    sector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sector',
      required: true,
    },
    agremiadoType: {
      type: String,
      required: true,
      enum: Object.values(AGREMIADO_TYPES),
    },
    identificationType: {
      type: String,
      required: true,
      enum: Object.values(IDENTIFICATION_TYPES),
    },
    identificationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessDescription: {
      type: String,
      required: true,
      trim: true,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
    },
    instagram: {
      type: String,
      trim: true,
    },
    facebook: {
      type: String,
      trim: true,
    },
    linkedin: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    accountStatus: {
      type: String,
      required: true,
      enum: Object.values(ACCOUNT_STATUSES),
      default: ACCOUNT_STATUSES.ACTIVA,
    },
    applicationStatus: {
      type: String,
      required: true,
      enum: Object.values(APPLICATION_STATUSES),
      default: APPLICATION_STATUSES.PENDING_REVIEW,
    },
    statusReason: {
      type: String,
      trim: true,
    },
    agremiadoCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const Agremiado = mongoose.model('Agremiado', agremiadoSchema);

module.exports = {
  Agremiado,
  AGREMIADO_TYPES,
  IDENTIFICATION_TYPES,
  APPLICATION_STATUSES,
};
