const test = require('node:test');
const assert = require('node:assert/strict');
const {
  authenticateAdmin,
  readCredentials,
  OUTCOMES,
} = require('../../src/services/adminAuthService');
const { ADMIN_ACCOUNT_STATUSES } = require('../../src/config/accountStatus');
const { ROLES } = require('../../src/config/roles');

const ACTIVE_ADMIN = {
  _id: '65f0c3a1b2c3d4e5f6a7b8c9',
  passwordHash: 'stored-hash',
  accountStatus: ADMIN_ACCOUNT_STATUSES.ACTIVE,
  invitationExpiresAt: null,
};

// What each state an administrator cannot sign in from answers with.
const REFUSALS_BY_STATE = {
  [ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING]: OUTCOMES.INVITATION_PENDING,
  [ADMIN_ACCOUNT_STATUSES.INVITATION_EXPIRED]: OUTCOMES.INVITATION_EXPIRED,
  [ADMIN_ACCOUNT_STATUSES.INACTIVE]: OUTCOMES.ACCOUNT_INACTIVE,
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
  const answer = await authenticateAdmin(
    { email: { $ne: null }, password: { $ne: null } },
    async () => {
      searched = true;
      return ACTIVE_ADMIN;
    },
    acceptsEveryPassword,
  );

  assert.deepEqual(answer, { outcome: OUTCOMES.INVALID_CREDENTIALS });
  assert.equal(searched, false);
});

test('a correct password on an active account returns the identity', async () => {
  const answer = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'right' },
    finding(ACTIVE_ADMIN),
    acceptsEveryPassword,
  );

  assert.deepEqual(answer, {
    outcome: OUTCOMES.AUTHENTICATED,
    identity: { id: ACTIVE_ADMIN._id, role: ROLES.ADMIN },
  });
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

  assert.deepEqual(unknown, { outcome: OUTCOMES.INVALID_CREDENTIALS });
  assert.deepEqual(wrongPassword, unknown);
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

// The state is explained only once the password is right, which is what keeps
// this from confirming that an address holds a panel account.
test('a password that is wrong on a refused account still says nothing about the state', async () => {
  const answer = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'wrong' },
    finding({ ...ACTIVE_ADMIN, accountStatus: ADMIN_ACCOUNT_STATUSES.INACTIVE }),
    acceptsNoPassword,
  );

  assert.deepEqual(answer, { outcome: OUTCOMES.INVALID_CREDENTIALS });
});

test('every state an administrator cannot work from has a refusal of its own', async () => {
  for (const [state, outcome] of Object.entries(REFUSALS_BY_STATE)) {
    const answer = await authenticateAdmin(
      { email: 'admin@cclu.cr', password: 'right' },
      finding({ ...ACTIVE_ADMIN, accountStatus: state }),
      acceptsEveryPassword,
    );

    assert.deepEqual(answer, { outcome }, `${state} answered ${JSON.stringify(answer)}`);
  }
});

// Nobody writes the expired state down: it is read, so an invitation that ran
// out of time says so the moment it does.
test('an invitation whose moment has passed answers as expired', async () => {
  const answer = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'right' },
    finding({
      ...ACTIVE_ADMIN,
      accountStatus: ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING,
      invitationExpiresAt: new Date(Date.now() - 60_000),
    }),
    acceptsEveryPassword,
  );

  assert.deepEqual(answer, { outcome: OUTCOMES.INVITATION_EXPIRED });
});

test('an invitation still inside its window answers as pending', async () => {
  const answer = await authenticateAdmin(
    { email: 'admin@cclu.cr', password: 'right' },
    finding({
      ...ACTIVE_ADMIN,
      accountStatus: ADMIN_ACCOUNT_STATUSES.INVITATION_PENDING,
      invitationExpiresAt: new Date(Date.now() + 60_000),
    }),
    acceptsEveryPassword,
  );

  assert.deepEqual(answer, { outcome: OUTCOMES.INVITATION_PENDING });
});
