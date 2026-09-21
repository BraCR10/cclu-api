const discountService = require('../services/discountService');

// Never public: the catalog of discounts between affiliates is a benefit of
// belonging, so even reading it takes a session (RF-MKT-007).
async function list(request, response, next, listDiscounts = discountService.listDiscounts) {
  response.json(await listDiscounts(request.query));
}

async function getOne(request, response, next, getDiscountById = discountService.getDiscountById) {
  response.json(await getDiscountById(request.params.id));
}

async function listMine(
  request,
  response,
  next,
  listOwnDiscounts = discountService.listOwnDiscounts,
) {
  response.json(await listOwnDiscounts(request.identity.id));
}

async function create(request, response, next, createDiscount = discountService.createDiscount) {
  response.status(201).json(await createDiscount(request.identity.id, request.body));
}

async function update(request, response, next, updateDiscount = discountService.updateDiscount) {
  response.json(await updateDiscount(request.params.id, request.identity.id, request.body));
}

async function close(request, response, next, closeDiscount = discountService.closeDiscount) {
  await closeDiscount(request.params.id, request.identity.id);
  response.status(204).end();
}

module.exports = { list, getOne, listMine, create, update, close };
