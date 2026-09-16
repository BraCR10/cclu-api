const healthService = require('../services/healthService');

async function getHealth(request, response) {
  const health = healthService.getHealthStatus();
  const statusCode = health.status === 'ok' ? 200 : 503;

  response.status(statusCode).json(health);
}

module.exports = { getHealth };
