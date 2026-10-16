const express = require('express');
const applicationReviewController = require('../controllers/applicationReviewController');
const adminProfileController = require('../controllers/adminProfileController');
const { authorize } = require('../middlewares/authorize');
const { ROLES } = require('../config/roles');

const adminRoutes = express.Router();

// Applied to the router rather than to each route, so a route added here later
// is an administrator route whether or not its author remembered to say so.
adminRoutes.use(authorize(ROLES.ADMIN));

adminRoutes.get('/me', adminProfileController.getOwnProfile);
adminRoutes.patch('/me', adminProfileController.updateOwnProfile);

adminRoutes.get('/applications/pending', applicationReviewController.getPendingApplications);
adminRoutes.get('/applications/decided', applicationReviewController.getDecidedApplications);
adminRoutes.post('/applications/:memberId/approve', applicationReviewController.approveApplication);
adminRoutes.post('/applications/:memberId/reject', applicationReviewController.rejectApplication);
// The middle answer between approving and rejecting: the applicant keeps their
// application and is told what to fix.
adminRoutes.post(
  '/applications/:memberId/request-changes',
  applicationReviewController.requestChangesApplication,
);

module.exports = { adminRoutes };
