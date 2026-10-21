const clock = require('../config/clock');
const reportService = require('../services/reportService');

async function getReports(request, response, next, list = reportService.listReports) {
  response.json(list());
}

async function getReport(request, response, next, read = reportService.readReport) {
  response.json(await read(request.params.type, request.query, clock.now()));
}

async function exportReport(request, response, next, build = reportService.exportReport) {
  const file = await build(request.params.type, request.query, clock.now());

  response.type(file.contentType).attachment(file.name).send(file.body);
}

module.exports = { getReports, getReport, exportReport };
