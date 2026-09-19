const test = require('node:test');
const assert = require('node:assert/strict');
const { requireActiveAccount } = require('../../src/middlewares/requireActiveAccount');
const { ROLES } = require('../../src/config/roles');

const IDENTITY = { id: '65f0c3a1b2c3d4e5f6a7b8c9', role: ROLES.MEMBER };

test('requireActiveAccount continues when the account still works', async () => {
  let continued = false;

  await requireActiveAccount(
    { identity: IDENTITY },
    {},
    () => {
      continued = true;
    },
    async () => true,
  );

  assert.equal(continued, true);
});

test('requireActiveAccount answers 401 once the account stops working', async () => {
  await assert.rejects(
    requireActiveAccount(
      { identity: IDENTITY },
      {},
      () => {},
      async () => false,
    ),
    { statusCode: 401 },
  );
});

test('requireActiveAccount does not continue a request it refuses', async () => {
  let continued = false;

  await assert.rejects(
    requireActiveAccount(
      { identity: IDENTITY },
      {},
      () => {
        continued = true;
      },
      async () => false,
    ),
  );

  assert.equal(continued, false);
});

test('requireActiveAccount asks about the identity the token carried', async () => {
  const asked = [];

  await requireActiveAccount(
    { identity: IDENTITY },
    {},
    () => {},
    async (identity) => {
      asked.push(identity);
      return true;
    },
  );

  assert.deepEqual(asked, [IDENTITY]);
});
