const catalogService = require('../services/catalogService');

async function getCantons(request, response) {
  response.json(await catalogService.listCantons());
}

async function getSectors(request, response) {
  response.json(await catalogService.listSectors());
}

module.exports = { getCantons, getSectors };
