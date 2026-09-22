const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasPaidMembership,
  readMonthlyFee,
  updateMonthlyFee,
  readOwnMembership,
} = require('../../src/services/membershipService');
const { MEMBERSHIP_BENEFITS } = require('../../src/config/membershipBenefits');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const NOW = new Date('2026-09-21T12:00:00.000Z');
const now = () => NOW;

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a membership is paid exactly while paidUntil lies ahead', () => {
  assert.equal(hasPaidMembership({ paidUntil: new Date('2026-10-21') }, now), true);
  assert.equal(hasPaidMembership({ paidUntil: new Date('2026-09-20') }, now), false);
  assert.equal(hasPaidMembership({ paidUntil: null }, now), false);
  assert.equal(hasPaidMembership({}, now), false);
});

test('the fee answers null until somebody configures it', async () => {
  assert.deepEqual(await readMonthlyFee(async () => null), { amount: null });
  assert.deepEqual(await readMonthlyFee(async () => ({ amount: 15000 })), { amount: 15000 });
});

test('a fee that is not a positive number is refused', async () => {
  for (const amount of [undefined, null, 0, -100, 'gratis', Number.NaN, Infinity]) {
    const error = await refusal(() => updateMonthlyFee({ amount }));

    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'amount');
  }
});

test('a valid fee is stored and echoed back', async () => {
  const saved = [];
  const save = async (amount) => {
    saved.push(amount);
    return { amount };
  };

  assert.deepEqual(await updateMonthlyFee({ amount: 15000 }, save), { amount: 15000 });
  assert.deepEqual(saved, [15000]);
});

test('a free membership answers with the paid benefits still listed', async () => {
  const membership = await readOwnMembership(
    MEMBER_ID,
    async () => ({ paidUntil: null }),
    async () => ({ amount: 15000 }),
  );

  assert.equal(membership.type, 'free');
  assert.equal(membership.paidUntil, null);
  assert.equal(membership.feeAmount, 15000);
  assert.deepEqual(membership.benefits, MEMBERSHIP_BENEFITS);
});

test('a paid membership carries the date it stands until', async () => {
  const paidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const membership = await readOwnMembership(
    MEMBER_ID,
    async () => ({ paidUntil }),
    async () => null,
  );

  assert.equal(membership.type, 'paid');
  assert.equal(membership.paidUntil, paidUntil);
  assert.equal(membership.feeAmount, null);
});

test('a membership for an account that vanished is a not found', async () => {
  const error = await refusal(() => readOwnMembership(MEMBER_ID, async () => null));

  assert.equal(error.statusCode, 404);
});
