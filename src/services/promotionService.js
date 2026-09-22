const { Promotion } = require('../models/Promotion');
const { buildTimedPublicationService } = require('./timedPublicationService');

// The limits mirror what the web already tells a person before sending.
const {
  listPublic: listPromotions,
  getPublicById: getPromotionById,
  listOwn: listOwnPromotions,
  create: createPromotion,
  update: updatePromotion,
  close: closePromotion,
} = buildTimedPublicationService({
  Model: Promotion,
  kindName: 'promotion',
  textFields: { title: 120, description: 2000, conditions: 1000 },
  searchField: 'title',
});

module.exports = {
  listPromotions,
  getPromotionById,
  listOwnPromotions,
  createPromotion,
  updatePromotion,
  closePromotion,
};
