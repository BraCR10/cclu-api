const express = require('express');
const memberProfileController = require('../controllers/memberProfileController');
const branchController = require('../controllers/branchController');
const storeController = require('../controllers/storeController');
const emailChangeController = require('../controllers/emailChangeController');
const membershipController = require('../controllers/membershipController');
const paymentController = require('../controllers/paymentController');
const vacancyController = require('../controllers/vacancyController');
const { readUpload } = require('../middlewares/readUpload');
const { requireEntitlement } = require('../middlewares/requireEntitlement');
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

// The places the chamber affiliates. The first one comes from the approved
// registration, so a member never starts with an empty list.
memberRoutes.get('/me/branches', authorize(ROLES.MEMBER), branchController.getOwnBranches);
memberRoutes.post('/me/branches', authorize(ROLES.MEMBER), branchController.createOwnBranch);
memberRoutes.patch(
  '/me/branches/:branchId',
  authorize(ROLES.MEMBER),
  branchController.updateOwnBranch,
);
memberRoutes.delete(
  '/me/branches/:branchId',
  authorize(ROLES.MEMBER),
  branchController.deleteOwnBranch,
);

// The shop as a client meets it: what it sells besides its trade, and its hours.
memberRoutes.get('/me/store', authorize(ROLES.MEMBER), storeController.getOwnStore);
memberRoutes.patch('/me/store', authorize(ROLES.MEMBER), storeController.updateStore);

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

// A member reads their vacancies on any plan, so the screen can say what
// unlocks publishing; publishing one is what the plan has to include.
memberRoutes.get('/me/vacancies', authorize(ROLES.MEMBER), vacancyController.getOwnVacancies);
memberRoutes.post(
  '/me/vacancies',
  authorize(ROLES.MEMBER),
  requireEntitlement('publishJobs'),
  vacancyController.createOwnVacancy,
);
memberRoutes.delete(
  '/me/vacancies/:vacancyId',
  authorize(ROLES.MEMBER),
  vacancyController.deleteOwnVacancy,
);

module.exports = { memberRoutes };
