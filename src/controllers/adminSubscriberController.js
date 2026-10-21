const adminSubscriberService = require('../services/adminSubscriberService');

async function getSubscribers(
  request,
  response,
  next,
  list = adminSubscriberService.listSubscribers,
) {
  response.json(await list(request.query));
}

async function exportSubscribers(
  request,
  response,
  next,
  build = adminSubscriberService.exportSubscribers,
) {
  const csv = await build(request.query);

  response.type('text/csv; charset=utf-8').attachment('suscriptores.csv').send(csv);
}

async function getSubscriberDistricts(
  request,
  response,
  next,
  list = adminSubscriberService.listSubscriberDistricts,
) {
  response.json(await list(request.query));
}

module.exports = { getSubscribers, exportSubscribers, getSubscriberDistricts };
