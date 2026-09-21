const express = require('express');
const memberProfileController = require('../controllers/memberProfileController');
const { authorize } = require('../middlewares/authorize');
const { limitCodeChecks } = require('../middlewares/rateLimits');
const { ROLES } = require('../config/roles');

const memberRoutes = express.Router();

// A profile belongs to the member signed in, so an administrator has none to
// read here. Theirs is a different screen, and a different ticket.
memberRoutes.get('/me', authorize(ROLES.MEMBER), memberProfileController.getOwnProfile);
memberRoutes.patch('/me', authorize(ROLES.MEMBER), memberProfileController.updateOwnProfile);

memberRoutes.get('/me/membership', authorize(ROLES.MEMBER), memberProfileController.getOwnMembership);

// Open to both roles: the question is the same one either of them asks, and the
// panel's own version only adds what an administrator may additionally see.
memberRoutes.post(
  '/verification',
  authorize(ROLES.MEMBER, ROLES.ADMIN),
  limitCodeChecks,
  memberProfileController.verifyCode,
);

module.exports = { memberRoutes };
