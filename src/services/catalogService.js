const { Canton } = require('../models/Canton');
const { Activity, ACTIVITY_STATUSES } = require('../models/Activity');

// The registration form cannot let someone pick a canton or an activity without
// knowing which exist, and both are closed lists the chamber decides.
function listCantons() {
  return Canton.find().select('name province').sort({ name: 1 }).lean();
}

// Only the accepted activities. One an applicant named is not offered to
// anybody else until the chamber has seen it.
function listActivities() {
  return Activity.find({ status: ACTIVITY_STATUSES.ACTIVE })
    .select('name')
    .sort({ name: 1 })
    .lean();
}

module.exports = { listCantons, listActivities };
