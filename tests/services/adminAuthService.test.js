const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticateAdmin, readCredentials } = require('../../src/services/adminAuthService');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');
const { ROLES } = require('../../src/config/roles');

const ACTIVE_ADMIN = {
  _id: '65f0c3a1b2c3d4e5f6a7b8c9',
  passwordHash: 'stored-hash',
  accountStatus: ACCOUNT_STATUSES.ACTIVE,
};

function findingNobody() {
  return async () => null;
}

function finding(admin) {
  return async () => admin;
}

const acceptsEveryPassword = async () => true;
const acceptsNoPassword = async () => false;

test('readCredentials refuses anything that is not a pair of strings', () => {
  assert.equal(readCredentials({ email: { $ne: null }, password: { $ne: null } }), null);
  assert.equal(readCredentials({ email: 'a@b.cr', password: { $gt: '' } }), null);
  assert.equal(readCredentials({ email: ['a@b.cr'], password: 'x' }), null);
  assert.equal(readCredentials({ email: 'a@b.cr' }), null);
  assert.equal(readCredentials({ email: '   ', password: 'x' }), null);
  assert.equal(readCredentials(null), null);
  assert.equal(readCredentials('a@b.cr'), null);
});

test('readCredentials normalises the address it will search by', () => {
  assert.deepEqual(readCredentials({ email: '  ADMIN@CCLU.CR ', password: 'x' }), {
    email: 'admin@cclu.cr',
    password: 'x',
  });
});

test('an operator in the body never becomes a query', async () => {
  let searched = false;
  const identity = await authenticateAdmin(
    { email: { $ne: null }, password: { $ne: null } },
    async () => {
      searched = true;
      return ACTIVE_ADMIN;
    },
    acceptsEveryPassword,
  );

  assert.equal(identity, null);
  assert.equal(searched, false);
});

test('a correct password on an active account returns the identity', async () => {
  const identity = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'right' },
    finding(ACTIVE_ADMIN),
    acceptsEveryPassword,
  );

  assert.deepEqual(identity, { id: ACTIVE_ADMIN._id, role: ROLES.ADMIN });
});

test('an unknown address and a wrong password are answered the same way', async () => {
  const unknown = await authenticateAdmin(
    { email: 'nobody@cclu.cr', password: 'whatever' },
    findingNobody(),
    acceptsNoPassword,
  );
  const wrongPassword = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'wrong' },
    finding(ACTIVE_ADMIN),
    acceptsNoPassword,
  );

  assert.equal(unknown, null);
  assert.equal(wrongPassword, null);
});

test('an unknown address still costs a password verification', async () => {
  let verifications = 0;

  await authenticateAdmin(
    { email: 'nobody@cclu.cr', password: 'whatever' },
    findingNobody(),
    async () => {
      verifications += 1;
      return false;
    },
  );

  assert.equal(verifications, 1);
});

test('a suspended administrator is refused even with the right password', async () => {
  const identity = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'right' },
    finding({ ...ACTIVE_ADMIN, accountStatus: ACCOUNT_STATUSES.SUSPENDED }),
    acceptsEveryPassword,
  );

  assert.equal(identity, null);
});
