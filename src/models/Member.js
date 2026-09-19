const mongoose = require('mongoose');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');

const MEMBER_TYPES = {
  BUSINESS: 'business',
  INDEPENDENT_PROFESSIONAL: 'independent_professional',
};

// dimex keeps its own name. It is a Costa Rican document for foreign residents,
// not a word with an English equivalent.
const IDENTIFICATION_TYPES = {
  NATIONAL_ID: 'national_id',
  LEGAL_ENTITY_ID: 'legal_entity_id',
  PASSPORT: 'passport',
  DIMEX: 'dimex',
};

const APPLICATION_STATUSES = {
  PENDING_REVIEW: 'pending_review',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const memberSchema = new mongoose.Schema(
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
    memberType: {
      type: String,
      required: true,
      enum: Object.values(MEMBER_TYPES),
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
      default: ACCOUNT_STATUSES.ACTIVE,
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
    memberCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const Member = mongoose.model('Member', memberSchema);

module.exports = {
  Member,
  MEMBER_TYPES,
  IDENTIFICATION_TYPES,
  APPLICATION_STATUSES,
};
