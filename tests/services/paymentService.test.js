const test = require('node:test');
const assert = require('node:assert/strict');
const { submitPayment, readEligibility } = require('../../src/services/paymentService');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const NOW = new Date('2026-11-14T15:00:00.000Z');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('receipt'),
]);
const RECEIPT = { mimetype: 'image/png', buffer: PNG };
const PRO_PLAN = { _id: 'plan-pro', key: 'pro', name: 'Pro Pymex', monthlyFee: 10000 };

// Everything a submission touches, held in memory so a test can see what was
// written and what was not.
function memoryStore(overrides = {}) {
  const written = { receipts: [], payments: [], audit: [] };

  return {
    written,
    findMember: async () => ({
      _id: MEMBER_ID,
      businessName: 'Café Loma Verde',
      email: 'cafe@example.com',
      memberCode: 'MA7K2Q4',
    }),
    findMembership: async () => ({ plan: { key: 'free' }, expiresAt: null }),
    readNoticeDays: async () => 7,
    findPendingPayment: async () => null,
    findApprovedReceipt: async () => false,
    findRejectedPayment: async () => true,
    findPlan: async () => PRO_PLAN,
    storeReceipt: async () => {
      const stored = {
        key: `payment-receipts/${MEMBER_ID}/x.png`,
        contentType: 'image/png',
        size: PNG.length,
        sha256: 'abc',
      };
      written.receipts.push(stored);
      return stored;
    },
    createPayment: async (document, auditEntry) => {
      written.payments.push(document);
      written.audit.push(auditEntry);
      return { _id: 'payment-1', ...document };
    },
    ...overrides,
  };
}

const quietly = async () => true;

test('a payment is registered pending, with the amount and plan frozen as they were', async () => {
  const store = memoryStore();

  const payment = await submitPayment(MEMBER_ID, { plan: 'pro' }, RECEIPT, store, quietly, NOW);

  assert.equal(payment.status, 'pending_review');
  assert.equal(payment.amount, 10000);
  assert.equal(payment.reference, 'MA7K2Q4 Membresia');
  assert.deepEqual(payment.plan, { key: 'pro', name: 'Pro Pymex' });
  assert.equal(store.written.payments[0].monthlyFee, 10000);
  assert.equal(store.written.payments[0].submittedAt, NOW);
  assert.equal(store.written.audit[0].action, 'payment.submitted');
});

test('a running plan cannot be paid for before its window opens, and nothing is stored', async () => {
  const store = memoryStore({
    findMembership: async () => ({
      plan: { key: 'pro' },
      expiresAt: new Date('2026-12-18T06:00:00.000Z'),
    }),
  });

  await assert.rejects(submitPayment(MEMBER_ID, { plan: 'pro' }, RECEIPT, store, quietly, NOW), {
    code: 'renewal_not_open',
    reason: '2026-12-11',
  });
  assert.equal(store.written.receipts.length, 0);
});

test('a second payment while one is pending is refused, and nothing is stored', async () => {
  const store = memoryStore({ findPendingPayment: async () => ({ _id: 'payment-0' }) });

  await assert.rejects(submitPayment(MEMBER_ID, { plan: 'pro' }, RECEIPT, store, quietly, NOW), {
    code: 'payment_pending',
  });
  assert.equal(store.written.receipts.length, 0);
});

test('two payments arriving together leave one pending and refuse the other', async () => {
  const store = memoryStore({
    createPayment: async () => {
      const duplicate = new Error('E11000 duplicate key error');
      duplicate.code = 11000;
      throw duplicate;
    },
  });

  await assert.rejects(submitPayment(MEMBER_ID, { plan: 'pro' }, RECEIPT, store, quietly, NOW), {
    code: 'payment_pending',
  });
});

test('a receipt that already paid for a term is refused, and nothing is stored', async () => {
  const store = memoryStore({ findApprovedReceipt: async () => true });

  await assert.rejects(submitPayment(MEMBER_ID, { plan: 'pro' }, RECEIPT, store, quietly, NOW), {
    code: 'receipt_already_used',
  });
  assert.equal(store.written.receipts.length, 0);
});

test('only a paid plan can be paid for, and the request is checked before anything is stored', async () => {
  for (const body of [{ plan: 'free' }, { plan: 'gold' }, { plan: { $ne: null } }, {}]) {
    const store = memoryStore();

    await assert.rejects(submitPayment(MEMBER_ID, body, RECEIPT, store, quietly, NOW), {
      code: 'invalid_format',
    });
    assert.equal(store.written.receipts.length, 0);
  }
});

test('a payment needs its receipt and a comment within its length', async () => {
  await assert.rejects(
    submitPayment(MEMBER_ID, { plan: 'pro' }, undefined, memoryStore(), quietly, NOW),
    {
      code: 'required',
    },
  );
  await assert.rejects(
    submitPayment(
      MEMBER_ID,
      { plan: 'pro', comment: 'x'.repeat(301) },
      RECEIPT,
      memoryStore(),
      quietly,
      NOW,
    ),
    { code: 'too_long' },
  );
});

test('a resubmission must answer a rejected payment of the same member', async () => {
  const store = memoryStore({ findRejectedPayment: async () => false });

  await assert.rejects(
    submitPayment(
      MEMBER_ID,
      { plan: 'pro', resubmissionOf: '65f0c3a1b2c3d4e5f6a7b8ca' },
      RECEIPT,
      store,
      quietly,
      NOW,
    ),
    { code: 'unknown_reference' },
  );
  assert.equal(store.written.receipts.length, 0);
});

test('the screen is told why a payment cannot be made yet and from when', async () => {
  const running = memoryStore({
    findMembership: async () => ({
      plan: { key: 'pro' },
      expiresAt: new Date('2026-12-18T06:00:00.000Z'),
    }),
  });

  const eligibility = await readEligibility(MEMBER_ID, running, NOW);

  assert.equal(eligibility.canSubmit, false);
  assert.equal(eligibility.reason, 'renewal_not_open');
  assert.equal(eligibility.opensOn, '2026-12-11');
});
