const mongoose = require('mongoose');

// One registration carries one branch, which the approval records from the
// applicant's answers. The rest are added from the panel, so each is a document
// of its own: the directory and the job board name a branch, not a business.
const branchSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // The one shown first, on the public profile and in the shop's own listing.
    // The service keeps exactly one of a member's branches primary.
    isPrimary: {
      type: Boolean,
      required: true,
      default: false,
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
    address: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    // Written the way the shop says it. Empty means the branch keeps the shop's
    // schedule, which is the one the member sets once.
    schedule: {
      type: String,
      trim: true,
    },
    // The chamber checks this against the municipality. The public profile never
    // shows it, so it is not part of what the directory projects.
    municipalPermit: {
      type: String,
      trim: true,
    },
    // A branch can trade under an activity of its own, when it has its own
    // patent. Empty means it inherits the business's.
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      default: null,
    },
    // A closed branch keeps its place in the chamber's records, so closing one
    // is a date rather than a delete.
    removedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Branch = mongoose.model('Branch', branchSchema);

module.exports = { Branch };
