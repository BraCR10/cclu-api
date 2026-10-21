const clock = require('../config/clock');
const subscriptionService = require('../services/subscriptionService');

async function subscribe(request, response, next, create = subscriptionService.subscribe) {
  response.status(201).json(await create(request.body, clock.now()));
}

module.exports = { subscribe };
