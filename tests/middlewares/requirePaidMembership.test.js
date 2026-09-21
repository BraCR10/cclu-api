const test = require('node:test');
const assert = require('node:assert/strict');
const { requirePaidMembership } = require('../../src/middlewares/requirePaidMembership');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';

const request = { identity: { id: MEMBER_ID } };
const response = {};

test('a member with the paid membership walks through', async () => {
  const paidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const check = requirePaidMembership(async () => ({ paidUntil }));
  let passed = false;

  await check(request, response, () => {
    passed = true;
  });

  assert.equal(passed, true);
});

test('a free membership is refused with the code the screen reads', async () => {
  for (const found of [null, {}, { paidUntil: null }, { paidUntil: new Date(Date.now() - 1000) }]) {
    const check = requirePaidMembership(async () => found);

    await assert.rejects(
      () =>
        check(request, response, () => {
          throw new Error('next must not run for a free membership');
        }),
      (error) => {
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, 'paid_membership_required');
        return true;
      },
    );
  }
});
