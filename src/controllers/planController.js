const planService = require('../services/planService');

async function getPlans(request, response, next, list = planService.listPlans) {
  response.json(await list());
}

async function updateFees(request, response, next, change = planService.changeFees) {
  response.json(await change(request.identity, request.body));
}

async function getFeeChanges(request, response, next, list = planService.listFeeChanges) {
  response.json(await list(request.query));
}

module.exports = { getPlans, updateFees, getFeeChanges };
