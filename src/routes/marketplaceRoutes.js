const express = require('express');
const marketplaceController = require('../controllers/marketplaceController');
const { authorize } = require('../middlewares/authorize');
const { requirePaidMembership } = require('../middlewares/requirePaidMembership');
const { ROLES } = require('../config/roles');

const marketplaceRoutes = express.Router();

// Reading a listing is public and lives in publicRoutes; publishing one takes
// the paid membership (CA-MKT-009-02), and is always scoped to the member who
// is signed in, so none of these paths collide with the public GETs.
marketplaceRoutes.post(
  '/',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  marketplaceController.create,
);
marketplaceRoutes.patch(
  '/:id',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  marketplaceController.update,
);
marketplaceRoutes.delete(
  '/:id',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  marketplaceController.close,
);
marketplaceRoutes.post(
  '/:id/image',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  marketplaceController.uploadImage,
);
marketplaceRoutes.delete(
  '/:id/image',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  marketplaceController.deleteImage,
);

module.exports = { marketplaceRoutes };
