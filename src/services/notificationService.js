const { Notification } = require('../models/Notification');
const { Admin } = require('../models/Admin');
const { ADMIN_ACCOUNT_STATUSES } = require('../config/accountStatus');
const { ROLES } = require('../config/roles');
const { ApplicationError, ERROR_CODES } = require('../config/errorCodes');
const { readPagination, paginated } = require('../config/pagination');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function ownedBy(identity) {
  return { recipientRole: identity.role, recipient: identity.id };
}

function presentNotification(notification) {
  return {
    id: String(notification._id),
    type: notification.type,
    params: Object.fromEntries(
      notification.params instanceof Map
        ? notification.params
        : Object.entries(notification.params ?? {}),
    ),
    read: notification.readAt !== null,
    createdAt: notification.createdAt,
  };
}

const defaultStore = {
  insert: (rows) => Notification.insertMany(rows),
  findActiveAdminIds: () => Admin.distinct('_id', { accountStatus: ADMIN_ACCOUNT_STATUSES.ACTIVE }),
  find: (filter, { skip, pageSize }) =>
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
  count: (filter) => Notification.countDocuments(filter),
  markRead: (filter, now) => Notification.updateMany(filter, { $set: { readAt: now } }),
};

// A notice accompanies an operation and never undoes it. A failure is logged and
// the operation stands, the way a notice by email is handled.
async function deliver(rows, store) {
  try {
    if (rows.length > 0) {
      await store.insert(rows);
    }

    return true;
  } catch (error) {
    console.error('Notification not stored', { type: rows[0]?.type, reason: error.message });

    return false;
  }
}

function notifyMember(memberId, type, params = {}, store = defaultStore) {
  return deliver([{ recipientRole: ROLES.MEMBER, recipient: memberId, type, params }], store);
}

async function notifyAdmins(type, params = {}, store = defaultStore) {
  try {
    const adminIds = await store.findActiveAdminIds();

    return deliver(
      adminIds.map((id) => ({ recipientRole: ROLES.ADMIN, recipient: id, type, params })),
      store,
    );
  } catch (error) {
    console.error('Notification not stored', { type, reason: error.message });

    return false;
  }
}

async function listOwnNotifications(identity, query, store = defaultStore) {
  const pagination = readPagination(query);
  const filter = ownedBy(identity);
  const [items, total, unread] = await Promise.all([
    store.find(filter, pagination),
    store.count(filter),
    store.count({ ...filter, readAt: null }),
  ]);

  return { ...paginated(items.map(presentNotification), total, pagination), unread };
}

// Marking a notice that is not one's own, or does not exist, answers the same
// way, so a guessed identifier tells nothing about anybody else's notices.
async function markOwnNotificationRead(identity, notificationId, now, store = defaultStore) {
  if (typeof notificationId !== 'string' || !OBJECT_ID.test(notificationId)) {
    throw notFound();
  }

  const { matchedCount } = await store.markRead({ ...ownedBy(identity), _id: notificationId }, now);

  if (matchedCount === 0) {
    throw notFound();
  }
}

async function markAllOwnNotificationsRead(identity, now, store = defaultStore) {
  await store.markRead({ ...ownedBy(identity), readAt: null }, now);
}

function notFound() {
  return new ApplicationError(ERROR_CODES.UNKNOWN_REFERENCE, 'There is no such notification.', {
    statusCode: 404,
  });
}

module.exports = {
  notifyMember,
  notifyAdmins,
  listOwnNotifications,
  markOwnNotificationRead,
  markAllOwnNotificationsRead,
};
