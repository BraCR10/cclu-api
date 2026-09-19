const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');

const router = express.Router();

router.get('/me', authenticate, authController.getCurrentIdentity);

// Signing out needs no proof of identity. Requiring it would refuse to clear
// the cookie of an expired session, which is exactly when clearing it matters.
router.post('/logout', authController.signOut);

module.exports = router;
