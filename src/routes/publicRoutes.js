const express = require('express');
const memberController = require('../controllers/memberController');
const catalogController = require('../controllers/catalogController');
const memberProfileController = require('../controllers/memberProfileController');
const memberDirectoryController = require('../controllers/memberDirectoryController');
const jobController = require('../controllers/jobController');
const marketplaceController = require('../controllers/marketplaceController');
const promotionController = require('../controllers/promotionController');
const resubmissionController = require('../controllers/resubmissionController');
const adminInvitationController = require('../controllers/adminInvitationController');
const { limitRegistrations } = require('../middlewares/rateLimits');

const publicRoutes = express.Router();

// Registration is open by definition: nobody has an account yet.
publicRoutes.post('/members', limitRegistrations, memberController.signUp);

// The form cannot offer a canton or a sector without first knowing which exist.
publicRoutes.get('/cantons', catalogController.getCantons);
publicRoutes.get('/sectors', catalogController.getSectors);

// The whole roll, searchable. Sits above the single-code lookup so the two
// never compete for the same path: this one always carries a query, that one
// a segment.
publicRoutes.get('/directory', memberDirectoryController.listDirectory);

// The address a card's QR carries. It is a permanent contract: a card already
// issued cannot be reissued, so this path never changes.
publicRoutes.get('/directory/:memberCode', memberProfileController.getPublicProfile);

// The board, open to anyone. Posting to it is a member's own action and lives
// under the gate, in jobRoutes.
publicRoutes.get('/jobs', jobController.list);
publicRoutes.get('/jobs/:id', jobController.getOne);

// The marketplace, open the same way. Posting to it lives under the gate, in
// marketplaceRoutes.
publicRoutes.get('/marketplace', marketplaceController.list);
publicRoutes.get('/marketplace/:id', marketplaceController.getOne);

// Promotions are as public as the products beside them. Discounts are not
// here on purpose: that catalog is a benefit of belonging and lives behind
// the gate (RF-MKT-007).
publicRoutes.get('/promotions', promotionController.list);
publicRoutes.get('/promotions/:id', promotionController.getOne);

// Reached by the link in a rejection message. Somebody whose registration was
// refused cannot sign in, so requiring a session would shut out the only person
// this exists for; the token is what proves the registration is theirs.
publicRoutes.get('/resubmission/:token', resubmissionController.getRejectedRegistration);
publicRoutes.post('/resubmission/:token', limitRegistrations, resubmissionController.resubmit);

// Guessing at codes is pointless against a sparse space of thirty three million
// with a check digit, so this carries no limit that a shared address could trip.

// Reached by the link in an invitation message. The person following it has no
// session yet and the account is suspended until a password is set, so this is
// deliberately public; the token is what proves the invitation is theirs.
publicRoutes.post(
  '/administrators/invitations/:invitationId/accept',
  adminInvitationController.acceptInvitation,
);

module.exports = { publicRoutes };
