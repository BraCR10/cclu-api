const clock = require('../config/clock');
const directoryService = require('../services/directoryService');

async function getDirectory(
  request,
  response,
  next,
  listDirectory = directoryService.listDirectory,
) {
  response.json(await listDirectory(request.query, clock.now()));
}

async function getDistricts(
  request,
  response,
  next,
  listDistricts = directoryService.listDistricts,
) {
  response.json(await listDistricts(request.query));
}

module.exports = { getDirectory, getDistricts };
