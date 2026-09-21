const marketplaceService = require('../services/marketplaceService');

// Public: anyone may browse the marketplace or open one listing.
async function list(request, response, next, listListings = marketplaceService.listListings) {
  response.json(await listListings(request.query));
}

async function getOne(request, response, next, getListingById = marketplaceService.getListingById) {
  response.json(await getListingById(request.params.id));
}

// The rest require a member session, and act only on that member's own
// listings: the identity comes from the session, never from the body.
async function listMine(
  request,
  response,
  next,
  listOwnListings = marketplaceService.listOwnListings,
) {
  response.json(await listOwnListings(request.identity.id));
}

async function create(request, response, next, createListing = marketplaceService.createListing) {
  response.status(201).json(await createListing(request.identity.id, request.body));
}

async function update(request, response, next, updateListing = marketplaceService.updateListing) {
  response.json(await updateListing(request.params.id, request.identity.id, request.body));
}

async function close(request, response, next, closeListing = marketplaceService.closeListing) {
  await closeListing(request.params.id, request.identity.id);
  response.status(204).end();
}

async function uploadImage(
  request,
  response,
  next,
  uploadListingImage = marketplaceService.uploadListingImage,
) {
  response.json(await uploadListingImage(request.params.id, request.identity.id, request.body));
}

async function deleteImage(
  request,
  response,
  next,
  removeListingImage = marketplaceService.removeListingImage,
) {
  await removeListingImage(request.params.id, request.identity.id);
  response.status(204).end();
}

module.exports = { list, getOne, listMine, create, update, close, uploadImage, deleteImage };
