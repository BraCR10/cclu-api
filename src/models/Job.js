const mongoose = require('mongoose');

const CONTRACT_TYPES = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  TEMPORARY: 'temporary',
  INTERNSHIP: 'internship',
};

const jobSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    contractType: {
      type: String,
      required: true,
      enum: Object.values(CONTRACT_TYPES),
    },
    location: {
      type: String,
      trim: true,
    },
    // Falls back to the member's own contact when absent, so a posting never
    // requires typing an address that already lives on the profile.
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    // Published content under BD-003 is kept permanently: closing a posting
    // turns this off rather than removing the record.
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

jobSchema.index({ member: 1 });
jobSchema.index({ isActive: 1, createdAt: -1 });

const Job = mongoose.model('Job', jobSchema);

module.exports = { Job, CONTRACT_TYPES };
