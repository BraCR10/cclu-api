const catalogService = require('../services/catalogService');

async function getCantons(request, response) {
  response.json(await catalogService.listCantons());
}

async function getActivities(request, response) {
  response.json(await catalogService.listActivities());
}

module.exports = { getCantons, getActivities };
