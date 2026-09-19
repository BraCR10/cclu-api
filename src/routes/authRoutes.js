const express = require('express');
const authController = require('../controllers/authController');

const publicAuthRoutes = express.Router();

// Signing out needs no proof of identity. Requiring it would refuse to clear
// the cookie of an expired session, which is exactly when clearing it matters.
publicAuthRoutes.post('/logout', authController.signOut);

const privateAuthRoutes = express.Router();

privateAuthRoutes.get('/me', authController.getCurrentIdentity);

module.exports = { publicAuthRoutes, privateAuthRoutes };
