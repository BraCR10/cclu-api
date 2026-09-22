const express = require('express');
const discountController = require('../controllers/discountController');
const { authorize } = require('../middlewares/authorize');
const { requirePaidMembership } = require('../middlewares/requirePaidMembership');
const { ROLES } = require('../config/roles');

const discountRoutes = express.Router();

// Even reading is gated: discounts between affiliates are a benefit of
// belonging, not a public catalog (RF-MKT-007). Administrators may look too.
discountRoutes.get('/', authorize(ROLES.MEMBER, ROLES.ADMIN), discountController.list);
discountRoutes.get('/:id', authorize(ROLES.MEMBER, ROLES.ADMIN), discountController.getOne);

discountRoutes.post(
  '/',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  discountController.create,
);
discountRoutes.patch(
  '/:id',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  discountController.update,
);
discountRoutes.delete(
  '/:id',
  authorize(ROLES.MEMBER),
  requirePaidMembership(),
  discountController.close,
);

module.exports = { discountRoutes };
