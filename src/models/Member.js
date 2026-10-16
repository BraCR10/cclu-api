const mongoose = require('mongoose');
const { ACCOUNT_STATUSES } = require('../config/accountStatus');

const MEMBER_TYPES = {
  BUSINESS: 'business',
  ASSOCIATION: 'association',
  INDEPENDENT_PROFESSIONAL: 'independent_professional',
};

// Whether a client can walk into the branch. It decides whether the address is
// required at all.
const BRANCH_MODALITIES = {
  PHYSICAL: 'physical',
  VIRTUAL: 'virtual',
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

// Kept one by one rather than as a single flag: the chamber has to be able to
// say which of the three was accepted.
const consentSchema = new mongoose.Schema(
  {
    statutes: { type: Boolean, default: false },
    marketplaceTerms: { type: Boolean, default: false },
    privacyPolicy: { type: Boolean, default: false },
  },
  { _id: false },
);

// What the chamber pointed at, and what it said about it. The pair travels
// together because a field named without a reason leaves the applicant looking
// at it without knowing what to change.
const correctionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    message: { type: String, required: true, trim: true },
  },
  { _id: false },
);

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
    // Step 1. What kind of affiliate this is, and the document that proves it.
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
    // A person's own name. It is what a profesional independiente is called,
    // because there is no company behind them to be named after.
    name: {
      type: String,
      trim: true,
    },
    // The razón social, as it appears in the Registro Nacional. Private by
    // design, which is why the directory does not display it.
    legalName: {
      type: String,
      trim: true,
    },
    legalRepresentativeName: {
      type: String,
      trim: true,
    },
    legalRepresentativeIdentification: {
      type: String,
      trim: true,
    },
    // The personería jurídica an empresa or an asociación is checked against,
    // stored the way every other file is.
    certificationFileKey: {
      type: String,
      trim: true,
    },
    certificationIssuedAt: {
      type: Date,
      default: null,
    },

    // Step 2. The business as the public sees it.
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    managerName: {
      type: String,
      trim: true,
    },
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      default: null,
    },
    // An activity the catalog does not carry yet. Named here, and it joins the
    // catalog when the chamber approves the registration.
    activityOther: {
      type: String,
      trim: true,
    },
    businessDescription: {
      type: String,
      required: true,
      trim: true,
    },
    logoFileKey: {
      type: String,
      trim: true,
    },

    // Step 2. One registration carries one branch; the rest are added from the
    // panel once it is approved.
    branchModality: {
      type: String,
      required: true,
      enum: Object.values(BRANCH_MODALITIES),
    },
    branchName: {
      type: String,
      required: true,
      trim: true,
    },
    canton: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Canton',
      required: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    // Required of a branch with a door, optional of one without.
    location: {
      type: String,
      trim: true,
    },
    institutionalPhone: {
      type: String,
      trim: true,
    },

    // Step 3. How the chamber and the clients reach the business.
    billingEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    consents: {
      type: consentSchema,
      default: () => ({}),
    },
    consentedAt: {
      type: Date,
      default: null,
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
      required: true,
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
    // What the chamber named when it asked for corrections, and what is wrong
    // with each one. Nothing here is a label: the field is the identifier the
    // API stores, and the message is what the applicant reads.
    changesRequestedFields: {
      type: [correctionSchema],
      default: [],
    },
    // Who decided and when. The whole system rests on this decision, so it does
    // not get to be anonymous.
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    memberCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    // What a rejection leaves behind so the applicant can come back. The link
    // in their message is the only proof they own this registration, so the
    // token is stored the way a password is and never in the clear.
    resubmissionTokenHash: {
      type: String,
      default: null,
    },
    resubmissionExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Looked up by this digest when somebody follows their link, so it is indexed
// and sparse: only a rejected registration carries one.
memberSchema.index({ resubmissionTokenHash: 1 }, { sparse: true });

const Member = mongoose.model('Member', memberSchema);

module.exports = {
  Member,
  MEMBER_TYPES,
  BRANCH_MODALITIES,
  IDENTIFICATION_TYPES,
  APPLICATION_STATUSES,
};
