const reportService = require('../services/reportService');

async function getReport(request, response, next, buildReport = reportService.buildReport) {
  response.json(await buildReport(request.query));
}

module.exports = { getReport };
