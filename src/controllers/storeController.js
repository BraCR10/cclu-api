const storeService = require('../services/storeService');

const { readOwnStore, updateOwnStore } = storeService;

async function getOwnStore(request, response, next, read = readOwnStore) {
  response.json(await read(request.identity.id));
}

async function updateStore(request, response, next, update = updateOwnStore) {
  response.json(await update(request.identity.id, request.body));
}

module.exports = { getOwnStore, updateStore };
