const express = require('express');
const membershipController = require('../controllers/membershipController');
const { authorize } = require('../middlewares/authorize');
const { ROLES } = require('../config/roles');

const membershipRoutes = express.Router();

// The fee is read by the member about to register a payment and by the
// administrator who configured it. Changing it lives under adminRoutes.
membershipRoutes.get('/fee', authorize(ROLES.MEMBER, ROLES.ADMIN), membershipController.getFee);

module.exports = { membershipRoutes };
