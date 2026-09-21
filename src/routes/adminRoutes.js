const express = require('express');
const applicationReviewController = require('../controllers/applicationReviewController');
const adminProfileController = require('../controllers/adminProfileController');
const adminInvitationController = require('../controllers/adminInvitationController');
const adminMemberManagementController = require('../controllers/adminMemberManagementController');
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

adminRoutes.patch('/administrators/:administratorId', adminInvitationController.updateAdministrator,);
adminRoutes.patch('/administrators/:administratorId/status', adminInvitationController.updateAdministratorStatus,);

adminRoutes.get('/applications/pending', applicationReviewController.getPendingApplications);
adminRoutes.get('/applications/decided', applicationReviewController.getDecidedApplications);
adminRoutes.post('/applications/:memberId/approve', applicationReviewController.approveApplication);
adminRoutes.post('/applications/:memberId/reject', applicationReviewController.rejectApplication);

// Member management: the panel lists every member with their membership, then
// moves a member between the account states and edits the membership itself.
adminRoutes.get('/members', adminMemberManagementController.listMembers);
adminRoutes.patch('/members/:memberId/status', adminMemberManagementController.updateMemberStatus);
adminRoutes.patch('/members/:memberId/membership', adminMemberManagementController.updateMembership);

module.exports = { adminRoutes };
