const express = require('express');
const memberController = require('../controllers/memberController');
const catalogController = require('../controllers/catalogController');
const memberProfileController = require('../controllers/memberProfileController');
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

// Guessing at codes is pointless against a sparse space of thirty three million
// with a check digit, so this carries no limit that a shared address could trip.
module.exports = { publicRoutes };
