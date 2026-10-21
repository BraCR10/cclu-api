const mongoose = require('mongoose');

const WORKDAYS = Object.freeze({
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  TEMPORARY: 'temporary',
});

// A vacancy is shown while it is active. The chamber can take one down from
// moderation, which keeps it and its reason; a member deleting one sets a date,
// so the reports still count what was published.
const VACANCY_STATUSES = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

const vacancySchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    // Where the job is. The job board places a vacancy by its branch.
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    requirements: { type: String, trim: true },
    workday: { type: String, required: true, enum: Object.values(WORKDAYS) },
    // People apply by the means the business names; there is no application
    // through the platform.
    howToApply: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(VACANCY_STATUSES),
      default: VACANCY_STATUSES.ACTIVE,
    },
    inactiveReason: { type: String, trim: true, default: null },
    publishedAt: { type: Date, required: true },
    removedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

vacancySchema.index({ status: 1, removedAt: 1, publishedAt: -1 });

const Vacancy = mongoose.model('Vacancy', vacancySchema);

module.exports = { Vacancy, WORKDAYS, VACANCY_STATUSES };
