const express = require('express');
const authController = require('../controllers/authController');
const passwordChangeController = require('../controllers/passwordChangeController');
const { limitByAddress, limitByAccount } = require('../middlewares/rateLimits');

const publicAuthRoutes = express.Router();

// Two routes, because what the answer may reveal differs. A member is told
// their application is pending once the password is right; an administrator is
// told nothing either way.
publicAuthRoutes.post('/admin/login', limitByAddress, limitByAccount, authController.signInAdmin);
publicAuthRoutes.post('/member/login', limitByAddress, limitByAccount, authController.signInMember);

// Signing out needs no proof of identity. Requiring it would refuse to clear
// the cookie of an expired session, which is exactly when clearing it matters.
publicAuthRoutes.post('/logout', authController.signOut);

const privateAuthRoutes = express.Router();

privateAuthRoutes.get('/me', authController.getCurrentIdentity);

// One flow for both roles: the steps are the same and building it twice would
// be two places for the code to be checked differently. The address limit
// counts failures, which is the shape of guessing at either step.
privateAuthRoutes.post('/password/request', limitByAddress, passwordChangeController.requestChange);
privateAuthRoutes.post('/password/confirm', limitByAddress, passwordChangeController.confirmChange);

module.exports = { publicAuthRoutes, privateAuthRoutes };
