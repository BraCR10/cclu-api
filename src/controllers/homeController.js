const clock = require('../config/clock');
const homeService = require('../services/homeService');

async function getHome(request, response, next, readHome = homeService.readHome) {
  response.json(await readHome(clock.now()));
}

module.exports = { getHome };
