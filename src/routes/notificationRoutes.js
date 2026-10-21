const express = require('express');
const notificationController = require('../controllers/notificationController');

// Members and administrators both have notices, and each reads only their own:
// the service scopes every query to the identity of the session.
const notificationRoutes = express.Router();

notificationRoutes.get('/', notificationController.getOwnNotifications);
notificationRoutes.post('/read', notificationController.markAllOwnNotificationsRead);
notificationRoutes.post('/:notificationId/read', notificationController.markOwnNotificationRead);

module.exports = { notificationRoutes };
