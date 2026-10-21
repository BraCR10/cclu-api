const express = require('express');
const applicationReviewController = require('../controllers/applicationReviewController');
const adminProfileController = require('../controllers/adminProfileController');
const planController = require('../controllers/planController');
const fileController = require('../controllers/fileController');
const adminPaymentController = require('../controllers/adminPaymentController');
const adminMembershipController = require('../controllers/adminMembershipController');
const adminSummaryController = require('../controllers/adminSummaryController');
const { authorize } = require('../middlewares/authorize');
const { ROLES } = require('../config/roles');

const adminRoutes = express.Router();

// Applied to the router rather than to each route, so a route added here later
// is an administrator route whether or not its author remembered to say so.
adminRoutes.use(authorize(ROLES.ADMIN));

adminRoutes.get('/summary', adminSummaryController.getSummary);

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

adminRoutes.patch('/plans/fees', planController.updateFees);
adminRoutes.get('/plans/fee-changes', planController.getFeeChanges);
adminRoutes.get('/plans/policy', adminMembershipController.getPolicy);
adminRoutes.patch('/plans/policy', adminMembershipController.updatePolicy);

adminRoutes.get('/memberships', adminMembershipController.getMemberships);

adminRoutes.get('/files/:key', fileController.openFileAsAdmin);

adminRoutes.get('/payments', adminPaymentController.getPayments);
adminRoutes.get('/payments/:paymentId', adminPaymentController.getPayment);
adminRoutes.get('/payments/:paymentId/receipt', adminPaymentController.getReceipt);
adminRoutes.post('/payments/:paymentId/approve', adminPaymentController.approvePayment);
adminRoutes.post('/payments/:paymentId/reject', adminPaymentController.rejectPayment);

module.exports = { adminRoutes };
