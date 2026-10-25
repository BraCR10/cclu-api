const mongoose = require('mongoose');

// How a member is classified. There is no sector: the chamber groups members by
// the economic activity the municipality licenses them for.
const ACTIVITY_STATUSES = {
  ACTIVE: 'active',
  // Named by an applicant and waiting for the chamber to accept it. Only a
  // registration that was approved gets this far, which is why the form can
  // promise that "otra actividad" joins the catalog on approval.
  PENDING: 'pending',
  // Retired from the catalog. It is not offered to anybody new, and the members
  // already classified under it keep their trade.
  INACTIVE: 'inactive',
};

const activitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ACTIVITY_STATUSES),
      default: ACTIVITY_STATUSES.ACTIVE,
    },
  },
  { timestamps: true },
);

const Activity = mongoose.model('Activity', activitySchema);

module.exports = { Activity, ACTIVITY_STATUSES };
