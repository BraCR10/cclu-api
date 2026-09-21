const express = require('express');
const authController = require('../controllers/authController');
const passwordResetController = require('../controllers/passwordResetController');
const {
  limitByAddress,
  limitByAccount,
  limitForgotPasswordByAddress,
  limitForgotPasswordByAccount,
} = require('../middlewares/rateLimits');

const publicAuthRoutes = express.Router();

// Two routes, because what the answer may reveal differs. A member is told
// their application is pending once the password is right; an administrator is
// told nothing either way.
publicAuthRoutes.post('/admin/login', limitByAddress, limitByAccount, authController.signInAdmin);
publicAuthRoutes.post('/member/login', limitByAddress, limitByAccount, authController.signInMember);

// Signing out needs no proof of identity. Requiring it would refuse to clear
// the cookie of an expired session, which is exactly when clearing it matters.
publicAuthRoutes.post('/logout', authController.signOut);

// Somebody who forgot their password cannot sign in to ask for a new one, so
// requiring a session here would shut out the only person this exists for. The
// answer is the same whether or not the address is an account.
publicAuthRoutes.post(
  '/password/forgot',
  limitForgotPasswordByAddress,
  limitForgotPasswordByAccount,
  passwordResetController.requestForgotten,
);

// The link arrives by mail and may be opened on a device that has no session.
// The token is what proves the request was theirs.
publicAuthRoutes.get('/password/reset/:token', limitByAddress, passwordResetController.checkLink);
publicAuthRoutes.post('/password/reset', limitByAddress, passwordResetController.completeReset);

const privateAuthRoutes = express.Router();

privateAuthRoutes.get('/me', authController.getCurrentIdentity);

// One flow for both roles: the steps are the same and building it twice would
// be two places for the rule to be applied differently. The current password is
// asked for here so that holding somebody's open session is not enough to make
// the chamber send them a link.
privateAuthRoutes.post(
  '/password/request',
  limitByAddress,
  passwordResetController.requestFromSession,
);

module.exports = { publicAuthRoutes, privateAuthRoutes };
