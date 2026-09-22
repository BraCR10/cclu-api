const express = require('express');
const memberProfileController = require('../controllers/memberProfileController');
const jobController = require('../controllers/jobController');
const marketplaceController = require('../controllers/marketplaceController');
const membershipController = require('../controllers/membershipController');
const paymentController = require('../controllers/paymentController');
const promotionController = require('../controllers/promotionController');
const discountController = require('../controllers/discountController');
const { authorize } = require('../middlewares/authorize');
const { limitCodeChecks } = require('../middlewares/rateLimits');
const { ROLES } = require('../config/roles');

const memberRoutes = express.Router();

// A profile belongs to the member signed in, so an administrator has none to
// read here. Theirs is a different screen, and a different ticket.
memberRoutes.get('/me', authorize(ROLES.MEMBER), memberProfileController.getOwnProfile);
memberRoutes.patch('/me', authorize(ROLES.MEMBER), memberProfileController.updateOwnProfile);
memberRoutes.post('/me/logo', authorize(ROLES.MEMBER), memberProfileController.uploadOwnLogo);
memberRoutes.delete('/me/logo', authorize(ROLES.MEMBER), memberProfileController.deleteOwnLogo);

// Sits here rather than under /jobs so it never has to compete with the
// public GET /jobs/:id for the same path.
memberRoutes.get('/me/jobs', authorize(ROLES.MEMBER), jobController.listMine);

// Same reasoning: /me/marketplace never competes with GET /marketplace/:id.
memberRoutes.get('/me/marketplace', authorize(ROLES.MEMBER), marketplaceController.listMine);
memberRoutes.get('/me/promotions', authorize(ROLES.MEMBER), promotionController.listMine);
memberRoutes.get('/me/discounts', authorize(ROLES.MEMBER), discountController.listMine);

// The membership and its payments belong to the member signed in; what an
// administrator may see of them lives under adminRoutes.
// The membership state is derived from approved payments (CA-AG-004-06), so
// this answers from the payments machinery rather than from a stored record.
memberRoutes.get('/me/membership', authorize(ROLES.MEMBER), membershipController.getOwnMembership);
memberRoutes.post('/me/payments', authorize(ROLES.MEMBER), paymentController.registerOwnPayment);
memberRoutes.get('/me/payments', authorize(ROLES.MEMBER), paymentController.listOwnPayments);

// Open to both roles: the question is the same one either of them asks, and the
// panel's own version only adds what an administrator may additionally see.
memberRoutes.post(
  '/verification',
  authorize(ROLES.MEMBER, ROLES.ADMIN),
  limitCodeChecks,
  memberProfileController.verifyCode,
);

module.exports = { memberRoutes };
