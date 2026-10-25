const adminActivityService = require('../services/adminActivityService');

async function getActivities(request, response, next, list = adminActivityService.listActivities) {
  response.json(await list(request.query));
}

async function createActivity(
  request,
  response,
  next,
  create = adminActivityService.createActivity,
) {
  response.status(201).json(await create(request.body));
}

async function updateActivity(
  request,
  response,
  next,
  update = adminActivityService.updateActivity,
) {
  response.json(await update(request.params.activityId, request.body));
}

async function removeActivity(
  request,
  response,
  next,
  remove = adminActivityService.removeActivity,
) {
  await remove(request.params.activityId);
  response.status(204).end();
}

module.exports = { getActivities, createActivity, updateActivity, removeActivity };
