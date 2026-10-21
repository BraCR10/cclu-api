const test = require('node:test');
const assert = require('node:assert/strict');
const {
  notifyMember,
  notifyAdmins,
  listOwnNotifications,
  markOwnNotificationRead,
  markAllOwnNotificationsRead,
} = require('../../src/services/notificationService');

const MEMBER = { id: '6aaf7c6235d3cb4fef09317b', role: 'member' };
const NOW = new Date('2026-10-20T12:00:00Z');

function recordingStore(overrides = {}) {
  const calls = { insert: [], find: [], count: [], markRead: [] };

  return {
    calls,
    insert: async (rows) => calls.insert.push(rows),
    findActiveAdminIds: async () => ['a1', 'a2'],
    find: async (filter) => {
      calls.find.push(filter);
      return [];
    },
    count: async (filter) => {
      calls.count.push(filter);
      return 0;
    },
    markRead: async (filter) => {
      calls.markRead.push(filter);
      return { matchedCount: 1 };
    },
    ...overrides,
  };
}

test('a notice for the panel reaches every active administrator', async () => {
  const store = recordingStore();

  await notifyAdmins('payment_submitted', { businessName: 'Café', amount: 10000 }, store);

  assert.deepEqual(
    store.calls.insert[0].map((row) => row.recipient),
    ['a1', 'a2'],
  );
  assert.ok(store.calls.insert[0].every((row) => row.recipientRole === 'admin'));
});

test('a notice that cannot be stored never fails the operation it accompanies', async () => {
  const store = recordingStore({
    insert: async () => {
      throw new Error('database down');
    },
    findActiveAdminIds: async () => {
      throw new Error('database down');
    },
  });
  const originalError = console.error;
  console.error = () => {};

  try {
    assert.equal(await notifyMember(MEMBER.id, 'payment_approved', {}, store), false);
    assert.equal(await notifyAdmins('payment_submitted', {}, store), false);
  } finally {
    console.error = originalError;
  }
});

test('a person only ever lists their own notices, with how many are unread', async () => {
  const store = recordingStore();

  const page = await listOwnNotifications(MEMBER, {}, store);

  for (const filter of [...store.calls.find, ...store.calls.count]) {
    assert.equal(filter.recipient, MEMBER.id);
    assert.equal(filter.recipientRole, 'member');
  }
  assert.ok(store.calls.count.some((filter) => filter.readAt === null));
  assert.equal(page.unread, 0);
});

test('marking a notice that is not one’s own answers as if it did not exist', async () => {
  const store = recordingStore({ markRead: async () => ({ matchedCount: 0 }) });

  await assert.rejects(
    () => markOwnNotificationRead(MEMBER, '6aaf7c6235d3cb4fef09317c', NOW, store),
    { statusCode: 404 },
  );
  await assert.rejects(() => markOwnNotificationRead(MEMBER, 'not-an-id', NOW, store), {
    statusCode: 404,
  });
});

test('marking every notice read touches only the person’s unread ones', async () => {
  const store = recordingStore();

  await markAllOwnNotificationsRead(MEMBER, NOW, store);

  assert.deepEqual(store.calls.markRead[0], {
    recipientRole: 'member',
    recipient: MEMBER.id,
    readAt: null,
  });
});
