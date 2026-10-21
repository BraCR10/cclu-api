const clock = require('../config/clock');
const adminSummaryService = require('../services/adminSummaryService');

async function getSummary(request, response, next, read = adminSummaryService.readSummary) {
  response.json(await read(clock.now()));
}

module.exports = { getSummary };
