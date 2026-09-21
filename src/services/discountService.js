const { Discount } = require('../models/Discount');
const { buildTimedPublicationService } = require('./timedPublicationService');

// A discount has no title: the ERS defines it by description, validity and
// conditions, so the search runs over the description instead.
const {
  listPublic: listDiscounts,
  getPublicById: getDiscountById,
  listOwn: listOwnDiscounts,
  create: createDiscount,
  update: updateDiscount,
  close: closeDiscount,
} = buildTimedPublicationService({
  Model: Discount,
  kindName: 'discount',
  textFields: { description: 2000, conditions: 1000 },
  searchField: 'description',
});

module.exports = {
  listDiscounts,
  getDiscountById,
  listOwnDiscounts,
  createDiscount,
  updateDiscount,
  closeDiscount,
};
