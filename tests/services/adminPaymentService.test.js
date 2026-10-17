const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvePayment,
  rejectPayment,
  readListQuery,
} = require('../../src/services/adminPaymentService');
const { lastValidDay } = require('../../src/config/chamberCalendar');

const ADMIN = { id: '65f0c3a1b2c3d4e5f6a7b8aa', role: 'admin' };
const PAYMENT_ID = '65f0c3a1b2c3d4e5f6a7b8bb';
const NOW = new Date('2026-11-14T15:00:00.000Z');

function pendingPayment(overrides = {}) {
  return {
    _id: PAYMENT_ID,
    member: 'member-1',
    plan: 'plan-pro',
    planKey: 'pro',
    planName: 'Pro Pymex',
    monthlyFee: 10000,
    months: 1,
    frequency: 'monthly',
    amount: 10000,
    reference: 'MA7K2Q4 Membresia',
    receipt: { key: 'k', contentType: 'image/png', size: 1, sha256: 'abc' },
    status: 'pending_review',
    submittedAt: NOW,
    ...overrides,
  };
}

function memoryStore({ payment = pendingPayment(), membership, member, sameReceipt = [] } = {}) {
  const decisions = [];

  return {
    decisions,
    findPayment: async () => payment,
    findMember: async () => ({
      _id: 'member-1',
      businessName: 'Café',
      memberCode: 'MA7K2Q4',
      email: 'c@example.com',
      accountStatus: 'active',
      ...member,
    }),
    findAdmin: async () => ({ _id: ADMIN.id, name: 'Laura' }),
    findMembership: async () =>
      membership ?? {
        _id: 'membership-1',
        plan: { _id: 'plan-free', key: 'free' },
        startedAt: new Date('2026-09-01'),
        expiresAt: null,
      },
    grant: async () => {},
    findSameReceipt: async () => sameReceipt,
    findEarlierAttempts: async () => [],
    approve: async (decision) => decisions.push({ type: 'approve', ...decision }),
    reject: async (decision) => decisions.push({ type: 'reject', ...decision }),
  };
}

const quietly = async () => true;

test('approving moves the member to the plan paid for, from the approval when nothing is running', async () => {
  const store = memoryStore();

  await approvePayment(ADMIN, PAYMENT_ID, store, quietly, NOW);

  const [decision] = store.decisions;
  assert.equal(decision.nextMembership.plan, 'plan-pro');
  assert.equal(decision.nextMembership.lastPaymentAt, NOW);
  assert.equal(decision.nextMembership.lapsed, null);
  assert.equal(lastValidDay(decision.term.expiresAt), '2026-12-14');
  assert.deepEqual(decision.decidedBy, { id: ADMIN.id, name: 'Laura' });
  assert.deepEqual(
    decision.auditEntries.map((entry) => entry.action),
    ['payment.approved', 'membership.renewed'],
  );
});

test('renewing the running plan extends it from its own end and keeps the day it began', async () => {
  const startedAt = new Date('2026-10-18T06:00:00.000Z');
  const store = memoryStore({
    membership: {
      _id: 'membership-1',
      plan: { _id: 'plan-pro', key: 'pro' },
      startedAt,
      expiresAt: new Date('2026-11-18T06:00:00.000Z'),
    },
  });

  await approvePayment(ADMIN, PAYMENT_ID, store, quietly, NOW);

  const [decision] = store.decisions;
  assert.equal(lastValidDay(decision.term.expiresAt), '2026-12-17');
  assert.equal(decision.nextMembership.startedAt, startedAt);
});

test('changing plan inside the window applies at once and still extends from the current end', async () => {
  const store = memoryStore({
    payment: pendingPayment({
      plan: 'plan-premium',
      planKey: 'premium',
      planName: 'Premium Empresarial',
    }),
    membership: {
      _id: 'membership-1',
      plan: { _id: 'plan-pro', key: 'pro' },
      startedAt: new Date('2026-10-18'),
      expiresAt: new Date('2026-11-18T06:00:00.000Z'),
    },
  });

  await approvePayment(ADMIN, PAYMENT_ID, store, quietly, NOW);

  const [decision] = store.decisions;
  assert.equal(decision.nextMembership.plan, 'plan-premium');
  assert.equal(decision.nextMembership.startedAt, NOW);
  assert.equal(lastValidDay(decision.term.expiresAt), '2026-12-17');
});

test('a payment already decided is not decided again', async () => {
  for (const status of ['approved', 'rejected']) {
    const store = memoryStore({ payment: pendingPayment({ status }) });

    await assert.rejects(approvePayment(ADMIN, PAYMENT_ID, store, quietly, NOW), {
      code: 'already_decided',
    });
    await assert.rejects(
      rejectPayment(ADMIN, PAYMENT_ID, { reason: 'Un motivo suficiente.' }, store, quietly, NOW),
      {
        code: 'already_decided',
      },
    );
    assert.equal(store.decisions.length, 0);
  }
});

test('the payment of a suspended account is not approved', async () => {
  const store = memoryStore({ member: { accountStatus: 'suspended' } });

  await assert.rejects(approvePayment(ADMIN, PAYMENT_ID, store, quietly, NOW), {
    code: 'account_suspended',
  });
  assert.equal(store.decisions.length, 0);
});

test('a receipt that already paid for another term is not approved twice', async () => {
  const store = memoryStore({ sameReceipt: [{ _id: 'other', status: 'approved' }] });

  await assert.rejects(approvePayment(ADMIN, PAYMENT_ID, store, quietly, NOW), {
    code: 'receipt_already_used',
  });
  assert.equal(store.decisions.length, 0);
});

test('a rejection needs a reason of ten to three hundred characters', async () => {
  for (const body of [
    {},
    { reason: '' },
    { reason: 'corto' },
    { reason: 'x'.repeat(301) },
    { reason: ['a'] },
  ]) {
    const store = memoryStore();

    await assert.rejects(rejectPayment(ADMIN, PAYMENT_ID, body, store, quietly, NOW));
    assert.equal(store.decisions.length, 0);
  }
});

test('a rejection keeps the reason and who gave it', async () => {
  const store = memoryStore();

  await rejectPayment(
    ADMIN,
    PAYMENT_ID,
    { reason: '  El detalle no coincide.  ' },
    store,
    quietly,
    NOW,
  );

  const [decision] = store.decisions;
  assert.equal(decision.reason, 'El detalle no coincide.');
  assert.equal(decision.auditEntry.action, 'payment.rejected');
});

test('the inbox lists pending payments unless asked for decided ones', () => {
  assert.equal(readListQuery({}).status, 'pending_review');
  assert.throws(() => readListQuery({ status: 'deleted' }), { code: 'invalid_format' });
  assert.throws(() => readListQuery({ status: ['approved'] }), { code: 'invalid_format' });
});
