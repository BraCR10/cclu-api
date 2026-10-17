const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAXIMUM_MONTHLY_FEE,
  readFees,
  changeFees,
  listFeeChanges,
} = require('../../src/services/planService');
const { ERROR_CODES } = require('../../src/config/errorCodes');
const { AUDIT_ACTIONS } = require('../../src/models/AuditEntry');

const ADMIN_ID = '65f0c3a1b2c3d4e5f6a7b8c9';

function storedPlans() {
  return [
    { _id: 'p1', key: 'free', name: 'Gratuita', monthlyFee: 0, entitlements: {} },
    { _id: 'p2', key: 'lite', name: 'Lite MiPyme', monthlyFee: 5000, entitlements: {} },
    { _id: 'p3', key: 'pro', name: 'Pro Pymex', monthlyFee: 10000, entitlements: {} },
    { _id: 'p4', key: 'premium', name: 'Premium Empresarial', monthlyFee: 20000, entitlements: {} },
  ];
}

function fakeStore(overrides = {}) {
  const applied = [];

  return {
    applied,
    findPlans: async () => storedPlans(),
    findAdmin: async () => ({ _id: ADMIN_ID, name: 'Laura Jiménez', email: 'laura@example.cr' }),
    applyFeeChanges: async (changes, actor) => applied.push({ changes, actor }),
    ...overrides,
  };
}

function refusedWith(code, field) {
  return (error) => {
    assert.equal(error.code, code);
    assert.equal(error.field, field);
    return true;
  };
}

test('Gratuita cannot be given a fee', () => {
  assert.throws(
    () => readFees({ fees: { free: 1000 } }),
    refusedWith(ERROR_CODES.NOT_ALLOWED, 'fees.free'),
  );
});

test('an amount that is not whole colones above zero is refused', () => {
  for (const fee of [0, -5000, 5000.5, '5000', null, MAXIMUM_MONTHLY_FEE + 1]) {
    assert.throws(
      () => readFees({ fees: { lite: fee } }),
      refusedWith(ERROR_CODES.INVALID_FORMAT, 'fees.lite'),
    );
  }
});

test('a plan that does not exist is refused by name', () => {
  assert.throws(
    () => readFees({ fees: { gold: 5000 } }),
    refusedWith(ERROR_CODES.UNKNOWN_REFERENCE, 'fees.gold'),
  );
});

test('one bad fee refuses the whole request before anything is written', async () => {
  const store = fakeStore();

  await assert.rejects(
    changeFees({ id: ADMIN_ID, role: 'admin' }, { fees: { lite: 6000, pro: -1 } }, store),
  );
  assert.equal(store.applied.length, 0);
});

test('fees equal to the current ones are nothing to change', async () => {
  const store = fakeStore();

  await assert.rejects(
    changeFees({ id: ADMIN_ID, role: 'admin' }, { fees: { lite: 5000, pro: 10000 } }, store),
    refusedWith(ERROR_CODES.NOTHING_TO_CHANGE, 'fees'),
  );
  assert.equal(store.applied.length, 0);
});

test('only the plans whose fee moved are written, each with its previous amount', async () => {
  const store = fakeStore();

  await changeFees(
    { id: ADMIN_ID, role: 'admin' },
    { fees: { lite: 5000, premium: 22000 } },
    store,
  );

  const [{ changes }] = store.applied;
  assert.deepEqual(
    changes.map(({ plan, previousFee, newFee }) => [plan.key, previousFee, newFee]),
    [['premium', 20000, 22000]],
  );
});

// The history keeps the name the administrator had when they acted, so it does
// not rewrite itself when they rename themselves later.
test('the change is attributed to the administrator by the name they had then', async () => {
  const store = fakeStore();

  await changeFees({ id: ADMIN_ID, role: 'admin' }, { fees: { pro: 12000 } }, store);

  assert.deepEqual(store.applied[0].actor, { id: ADMIN_ID, role: 'admin', name: 'Laura Jiménez' });
});

test('an administrator without a name is attributed by address', async () => {
  const store = fakeStore({
    findAdmin: async () => ({ _id: ADMIN_ID, email: 'laura@example.cr' }),
  });

  await changeFees({ id: ADMIN_ID, role: 'admin' }, { fees: { pro: 12000 } }, store);

  assert.equal(store.applied[0].actor.name, 'laura@example.cr');
});

test('the history answers with the plan key, both amounts and who changed it', async () => {
  const entries = [
    {
      _id: 'e1',
      action: AUDIT_ACTIONS.PLAN_FEE_CHANGED,
      occurredAt: new Date('2026-01-15T16:12:00Z'),
      actor: { id: ADMIN_ID, role: 'admin', name: 'Laura Jiménez' },
      subject: { type: 'Plan', id: 'p4', label: 'Premium Empresarial' },
      changes: [{ field: 'monthlyFee', before: 18000, after: 20000 }],
    },
  ];

  const [change] = await listFeeChanges(
    async () => entries,
    async () => storedPlans(),
  );

  assert.deepEqual(change, {
    id: 'e1',
    occurredAt: new Date('2026-01-15T16:12:00Z'),
    plan: { key: 'premium', name: 'Premium Empresarial' },
    previousFee: 18000,
    newFee: 20000,
    changedBy: 'Laura Jiménez',
  });
});
