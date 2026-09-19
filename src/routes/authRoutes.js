const express = require('express');
const authController = require('../controllers/authController');
const { limitByAddress, limitByAccount } = require('../middlewares/limitLoginAttempts');

const publicAuthRoutes = express.Router();

// Members sign in through their own route, because what the answer may reveal
// differs: a member is told their application is still pending once the
// password is right, and an administrator is told nothing either way.
publicAuthRoutes.post('/admin/login', limitByAddress, limitByAccount, authController.signInAdmin);

// Signing out needs no proof of identity. Requiring it would refuse to clear
// the cookie of an expired session, which is exactly when clearing it matters.
publicAuthRoutes.post('/logout', authController.signOut);

const privateAuthRoutes = express.Router();

privateAuthRoutes.get('/me', authController.getCurrentIdentity);

module.exports = { publicAuthRoutes, privateAuthRoutes };
