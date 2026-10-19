const express = require('express');
const memberProfileController = require('../controllers/memberProfileController');
const emailChangeController = require('../controllers/emailChangeController');
const membershipController = require('../controllers/membershipController');
const paymentController = require('../controllers/paymentController');
const { readUpload } = require('../middlewares/readUpload');
const { authorize } = require('../middlewares/authorize');
const { limitByAddress, limitCodeChecks, limitPayments } = require('../middlewares/rateLimits');
const { ROLES } = require('../config/roles');

const memberRoutes = express.Router();

// A profile belongs to the member signed in, so an administrator has none to
// read here. Theirs is a different screen, and a different ticket.
memberRoutes.get('/me', authorize(ROLES.MEMBER), memberProfileController.getOwnProfile);
memberRoutes.patch('/me', authorize(ROLES.MEMBER), memberProfileController.updateOwnProfile);

// Sending a message is what this does, so it answers to the same limit as any
// other route that mails a stranger's address.
memberRoutes.post(
  '/me/email-change',
  authorize(ROLES.MEMBER),
  limitByAddress,
  emailChangeController.requestEmailChange,
);

memberRoutes.get('/me/membership', authorize(ROLES.MEMBER), membershipController.getOwnMembership);

memberRoutes.get(
  '/me/payments/eligibility',
  authorize(ROLES.MEMBER),
  paymentController.getEligibility,
);
memberRoutes.post(
  '/me/payments',
  authorize(ROLES.MEMBER),
  limitPayments,
  readUpload,
  paymentController.submitPayment,
);
memberRoutes.get('/me/payments', authorize(ROLES.MEMBER), paymentController.getOwnPayments);
memberRoutes.get(
  '/me/payments/:paymentId',
  authorize(ROLES.MEMBER),
  paymentController.getOwnPayment,
);
memberRoutes.get(
  '/me/payments/:paymentId/receipt',
  authorize(ROLES.MEMBER),
  paymentController.getOwnReceipt,
);

// Open to both roles: the question is the same one either of them asks, and the
// panel's own version only adds what an administrator may additionally see.
memberRoutes.post(
  '/verification',
  authorize(ROLES.MEMBER, ROLES.ADMIN),
  limitCodeChecks,
  memberProfileController.verifyCode,
);

module.exports = { memberRoutes };
