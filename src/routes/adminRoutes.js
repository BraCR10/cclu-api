const express = require('express');
const applicationReviewController = require('../controllers/applicationReviewController');
const adminProfileController = require('../controllers/adminProfileController');
const adminInvitationController = require('../controllers/adminInvitationController');
const adminMemberManagementController = require('../controllers/adminMemberManagementController');
const membershipController = require('../controllers/membershipController');
const paymentController = require('../controllers/paymentController');
const moderationController = require('../controllers/moderationController');
const reportController = require('../controllers/reportController');
const { authorize } = require('../middlewares/authorize');
const { ROLES } = require('../config/roles');

const adminRoutes = express.Router();

// Applied to the router rather than to each route, so a route added here later
// is an administrator route whether or not its author remembered to say so.
adminRoutes.use(authorize(ROLES.ADMIN));

adminRoutes.get('/me', adminProfileController.getOwnProfile);
adminRoutes.patch('/me', adminProfileController.updateOwnProfile);

adminRoutes.post('/administrators/invitations', adminInvitationController.inviteAdministrator);
adminRoutes.get('/administrators', adminInvitationController.listAdministrators);

adminRoutes.patch(
  '/administrators/:administratorId',
  adminInvitationController.updateAdministrator,
);
adminRoutes.patch(
  '/administrators/:administratorId/status',
  adminInvitationController.updateAdministratorStatus,
);

adminRoutes.get('/applications/pending', applicationReviewController.getPendingApplications);
adminRoutes.get('/applications/decided', applicationReviewController.getDecidedApplications);
adminRoutes.post('/applications/:memberId/approve', applicationReviewController.approveApplication);
adminRoutes.post('/applications/:memberId/reject', applicationReviewController.rejectApplication);

// Member management: the panel lists every member with their membership, then
// moves a member between the account states and edits the membership itself.
adminRoutes.get('/members', adminMemberManagementController.listMembers);
adminRoutes.patch('/members/:memberId/status', adminMemberManagementController.updateMemberStatus);
adminRoutes.patch(
  '/members/:memberId/membership',
  adminMemberManagementController.updateMembership,
);

// The manual reconciliation the whole membership rests on (RF-ADM-004/005).
adminRoutes.get('/payments/pending', paymentController.listPending);
adminRoutes.post('/payments/:paymentId/approve', paymentController.approve);
adminRoutes.post('/payments/:paymentId/reject', paymentController.reject);
adminRoutes.get('/members/:memberId/payments', paymentController.listForMember);
adminRoutes.get('/memberships', paymentController.listMemberships);
adminRoutes.put('/membership/fee', membershipController.updateFee);

// The chamber's say over what the commerces publish (RF-ADM-008).
adminRoutes.get('/publications', moderationController.listPublications);
adminRoutes.post('/publications/:type/:id/moderation', moderationController.moderate);

adminRoutes.get('/reports', reportController.getReport);

module.exports = { adminRoutes };
