const test = require('node:test');
const assert = require('node:assert/strict');
const {
  lapseExpiredMemberships,
  remindExpiringMemberships,
} = require('../../src/services/membershipExpiryService');

const NOW = new Date('2026-10-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const FREE = { _id: 'plan-free', key: 'free', name: 'Gratuita' };
const PRO = { _id: 'plan-pro', key: 'pro', name: 'Pro Pymex' };
const MEMBER = { email: 'cafe@example.com', businessName: 'Café Loma Verde' };

function membership(overrides) {
  return {
    _id: 'membership-1',
    member: MEMBER,
    plan: PRO,
    expiresAt: new Date(NOW.getTime() - DAY),
    reminderSentFor: null,
    lapsed: null,
    ...overrides,
  };
}

// Holds the memberships in memory and honours the same conditions the real
// writes put in their filters, so a second run sees what the first one left.
// Reads hand out copies, as a lean query does.
function memoryStore(memberships) {
  const auditEntries = [];

  return {
    memberships,
    auditEntries,
    findFreePlan: async () => FREE,
    findExpired: async (now) =>
      memberships
        .filter(
          (item) => item.plan.key !== FREE.key && item.expiresAt !== null && item.expiresAt <= now,
        )
        .map((item) => ({ ...item })),
    lapse: async (snapshot) => {
      const stored = memberships.find((item) => item._id === snapshot._id);

      if (stored.plan !== snapshot.plan || stored.expiresAt !== snapshot.expiresAt) {
        return false;
      }

      stored.lapsed = { plan: stored.plan, expiredAt: stored.expiresAt };
      stored.plan = FREE;
      stored.expiresAt = null;
      auditEntries.push(snapshot._id);
      return true;
    },
    findExpiring: async (now, until) =>
      memberships
        .filter(
          (item) =>
            item.expiresAt !== null &&
            item.expiresAt > now &&
            item.expiresAt <= until &&
            item.reminderSentFor !== item.expiresAt,
        )
        .map((item) => ({ ...item })),
    claimReminder: async (snapshot) => {
      const stored = memberships.find((item) => item._id === snapshot._id);

      if (stored.reminderSentFor === stored.expiresAt) {
        return false;
      }

      stored.reminderSentFor = stored.expiresAt;
      return true;
    },
    releaseReminder: async (snapshot) => {
      memberships.find((item) => item._id === snapshot._id).reminderSentFor = null;
    },
  };
}

function recordingMail() {
  const sent = [];

  return {
    sent,
    deliver: async (template, recipient) => {
      sent.push({ template, recipient });
      return true;
    },
  };
}

test('a paid plan past its expiry moves to Gratuita once, with one notice and one entry', async () => {
  const store = memoryStore([membership()]);
  const mail = recordingMail();

  assert.equal(await lapseExpiredMemberships(NOW, store, mail.deliver), 1);
  assert.equal(await lapseExpiredMemberships(NOW, store, mail.deliver), 0);

  const [stored] = store.memberships;
  assert.equal(stored.plan.key, 'free');
  assert.equal(stored.expiresAt, null);
  assert.equal(stored.lapsed.plan.key, 'pro');
  assert.equal(store.auditEntries.length, 1);
  assert.deepEqual(mail.sent, [{ template: 'membershipLapsed', recipient: MEMBER.email }]);
});

test('a plan that has not expired yet is left alone', async () => {
  const store = memoryStore([membership({ expiresAt: new Date(NOW.getTime() + DAY) })]);
  const mail = recordingMail();

  assert.equal(await lapseExpiredMemberships(NOW, store, mail.deliver), 0);
  assert.equal(store.memberships[0].plan.key, 'pro');
  assert.equal(mail.sent.length, 0);
});

test('a membership renewed between the read and the write is not moved', async () => {
  const store = memoryStore([membership()]);
  const lapse = store.lapse;

  store.lapse = async (snapshot, freePlan) => {
    store.memberships[0].expiresAt = new Date(NOW.getTime() + 30 * DAY);
    return lapse(snapshot, freePlan);
  };

  assert.equal(await lapseExpiredMemberships(NOW, store, recordingMail().deliver), 0);
  assert.equal(store.memberships[0].plan.key, 'pro');
  assert.equal(store.auditEntries.length, 0);
});

test('the reminder goes out once per expiry, however often the run repeats', async () => {
  const store = memoryStore([membership({ expiresAt: new Date(NOW.getTime() + 3 * DAY) })]);
  const mail = recordingMail();

  assert.equal(await remindExpiringMemberships(NOW, store, mail.deliver), 1);
  assert.equal(await remindExpiringMemberships(NOW, store, mail.deliver), 0);
  assert.deepEqual(mail.sent, [{ template: 'membershipExpiring', recipient: MEMBER.email }]);
});

test('no reminder is sent for a plan more than seven days from its expiry', async () => {
  const store = memoryStore([membership({ expiresAt: new Date(NOW.getTime() + 8 * DAY) })]);
  const mail = recordingMail();

  assert.equal(await remindExpiringMemberships(NOW, store, mail.deliver), 0);
});

test('a reminder that could not be delivered is tried again on the next run', async () => {
  const store = memoryStore([membership({ expiresAt: new Date(NOW.getTime() + 3 * DAY) })]);
  const mail = recordingMail();
  const failing = async () => {
    throw new Error('SMTP down');
  };

  assert.equal(await remindExpiringMemberships(NOW, store, failing), 0);
  assert.equal(store.memberships[0].reminderSentFor, null);
  assert.equal(await remindExpiringMemberships(NOW, store, mail.deliver), 1);
});

test('a renewal makes the reminder due again for the new expiry', async () => {
  const store = memoryStore([membership({ expiresAt: new Date(NOW.getTime() + 3 * DAY) })]);
  const mail = recordingMail();

  await remindExpiringMemberships(NOW, store, mail.deliver);
  store.memberships[0].expiresAt = new Date(NOW.getTime() + 33 * DAY);

  const later = new Date(NOW.getTime() + 28 * DAY);
  assert.equal(await remindExpiringMemberships(later, store, mail.deliver), 1);
});
