const express = require('express');
const applicationReviewController = require('../controllers/applicationReviewController');
const adminActivityController = require('../controllers/adminActivityController');
const adminMemberController = require('../controllers/adminMemberController');
const adminProfileController = require('../controllers/adminProfileController');
const planController = require('../controllers/planController');
const fileController = require('../controllers/fileController');
const adminPaymentController = require('../controllers/adminPaymentController');
const adminMembershipController = require('../controllers/adminMembershipController');
const adminSummaryController = require('../controllers/adminSummaryController');
const adminDirectoryController = require('../controllers/adminDirectoryController');
const reportController = require('../controllers/reportController');
const adminSubscriberController = require('../controllers/adminSubscriberController');
const { authorize } = require('../middlewares/authorize');
const { ROLES } = require('../config/roles');

const adminRoutes = express.Router();

// Applied to the router rather than to each route, so a route added here later
// is an administrator route whether or not its author remembered to say so.
adminRoutes.use(authorize(ROLES.ADMIN));

adminRoutes.get('/summary', adminSummaryController.getSummary);

adminRoutes.get('/reports', reportController.getReports);
adminRoutes.get('/reports/:type', reportController.getReport);
adminRoutes.get('/reports/:type/export', reportController.exportReport);

adminRoutes.get('/subscribers', adminSubscriberController.getSubscribers);
adminRoutes.get('/subscribers/export', adminSubscriberController.exportSubscribers);
adminRoutes.get('/subscribers/districts', adminSubscriberController.getSubscriberDistricts);

// The catalog of economic activities: what a member is, offered to everybody at
// registration, and the one list the chamber edits by hand.
adminRoutes.get('/activities', adminActivityController.getActivities);
adminRoutes.post('/activities', adminActivityController.createActivity);
adminRoutes.patch('/activities/:activityId', adminActivityController.updateActivity);
adminRoutes.delete('/activities/:activityId', adminActivityController.removeActivity);

// The people the chamber keeps: who they are, what they hold, and the two
// states their account can be in. The export comes before the identifier so
// "export" is never read as one.
adminRoutes.get('/members', adminMemberController.getMembers);
adminRoutes.get('/members/export', adminMemberController.exportMembers);
adminRoutes.get('/members/:memberId', adminMemberController.getMember);
adminRoutes.patch('/members/:memberId', adminMemberController.updateMember);
adminRoutes.patch('/members/:memberId/status', adminMemberController.setMemberStatus);

adminRoutes.get('/me', adminProfileController.getOwnProfile);
adminRoutes.patch('/me', adminProfileController.updateOwnProfile);
// The one password an administrator can change without a link: their own.
adminRoutes.post('/me/password', adminProfileController.changePassword);

adminRoutes.get('/applications/pending', applicationReviewController.getPendingApplications);
adminRoutes.get('/applications/decided', applicationReviewController.getDecidedApplications);
// Declared after the two lists, so "pending" and "decided" are never read as an
// identifier.
adminRoutes.get('/applications/:memberId', applicationReviewController.getApplication);
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

// The administrators the chamber keeps: who they are, who is invited, and who
// has been let go. Every one of them is an administrator already.
adminRoutes.get('/administrators', adminDirectoryController.getAdmins);
adminRoutes.post('/administrators', adminDirectoryController.invite);
adminRoutes.post('/administrators/:adminId/invitation', adminDirectoryController.resend);
adminRoutes.patch('/administrators/:adminId/status', adminDirectoryController.setStatus);

module.exports = { adminRoutes };
