const express = require('express');
const memberController = require('../controllers/memberController');
const catalogController = require('../controllers/catalogController');
const memberProfileController = require('../controllers/memberProfileController');
const resubmissionController = require('../controllers/resubmissionController');
const { limitRegistrations } = require('../middlewares/rateLimits');

const publicRoutes = express.Router();

// Registration is open by definition: nobody has an account yet.
publicRoutes.post('/members', limitRegistrations, memberController.signUp);

// The form cannot offer a canton or a sector without first knowing which exist.
publicRoutes.get('/cantons', catalogController.getCantons);
publicRoutes.get('/sectors', catalogController.getSectors);

// The address a card's QR carries. It is a permanent contract: a card already
// issued cannot be reissued, so this path never changes.
publicRoutes.get('/directory/:memberCode', memberProfileController.getPublicProfile);

// Reached by the link in a rejection message. Somebody whose registration was
// refused cannot sign in, so requiring a session would shut out the only person
// this exists for; the token is what proves the registration is theirs.
publicRoutes.get('/resubmission/:token', resubmissionController.getRejectedRegistration);
publicRoutes.post('/resubmission/:token', limitRegistrations, resubmissionController.resubmit);

// Guessing at codes is pointless against a sparse space of thirty three million
// with a check digit, so this carries no limit that a shared address could trip.
module.exports = { publicRoutes };
