const express = require('express');
const promotionController = require('../controllers/promotionController');
const { authorize } = require('../middlewares/authorize');
const { requirePaidMembership } = require('../middlewares/requirePaidMembership');
const { ROLES } = require('../config/roles');

const promotionRoutes = express.Router();

// Reading lives in publicRoutes; publishing takes the paid membership, which
// is the whole difference between the two tiers (RF-AG-005).
promotionRoutes.post(
  '/',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  promotionController.create,
);
promotionRoutes.patch(
  '/:id',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  promotionController.update,
);
promotionRoutes.delete(
  '/:id',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  promotionController.close,
);

module.exports = { promotionRoutes };
