const marketplaceService = require('../services/marketplaceService');

const { readMarketplace, readMarketplaceItem } = marketplaceService;

async function getMarketplace(request, response, next, read = readMarketplace) {
  response.json(await read(request.query));
}

async function getMarketplaceItem(request, response, next, read = readMarketplaceItem) {
  response.json(await read(request.params.publicationId));
}

module.exports = { getMarketplace, getMarketplaceItem };
