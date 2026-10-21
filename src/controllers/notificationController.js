const clock = require('../config/clock');
const notificationService = require('../services/notificationService');

async function getOwnNotifications(
  request,
  response,
  next,
  list = notificationService.listOwnNotifications,
) {
  response.json(await list(request.identity, request.query));
}

async function markOwnNotificationRead(
  request,
  response,
  next,
  markRead = notificationService.markOwnNotificationRead,
) {
  await markRead(request.identity, request.params.notificationId, clock.now());
  response.status(204).end();
}

async function markAllOwnNotificationsRead(
  request,
  response,
  next,
  markAllRead = notificationService.markAllOwnNotificationsRead,
) {
  await markAllRead(request.identity, clock.now());
  response.status(204).end();
}

module.exports = { getOwnNotifications, markOwnNotificationRead, markAllOwnNotificationsRead };
