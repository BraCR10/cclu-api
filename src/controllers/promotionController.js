const promotionService = require('../services/promotionService');

// Public: anyone may browse the promotions or open one.
async function list(request, response, next, listPromotions = promotionService.listPromotions) {
  response.json(await listPromotions(request.query));
}

async function getOne(
  request,
  response,
  next,
  getPromotionById = promotionService.getPromotionById,
) {
  response.json(await getPromotionById(request.params.id));
}

// The rest act only on the member's own promotions: the identity comes from
// the session, never from the body.
async function listMine(
  request,
  response,
  next,
  listOwnPromotions = promotionService.listOwnPromotions,
) {
  response.json(await listOwnPromotions(request.identity.id));
}

async function create(request, response, next, createPromotion = promotionService.createPromotion) {
  response.status(201).json(await createPromotion(request.identity.id, request.body));
}

async function update(request, response, next, updatePromotion = promotionService.updatePromotion) {
  response.json(await updatePromotion(request.params.id, request.identity.id, request.body));
}

async function close(request, response, next, closePromotion = promotionService.closePromotion) {
  await closePromotion(request.params.id, request.identity.id);
  response.status(204).end();
}

module.exports = { list, getOne, listMine, create, update, close };
