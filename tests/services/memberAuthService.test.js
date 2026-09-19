const test = require('node:test');
const assert = require('node:assert/strict');
const {
  authenticateMember,
  readCredentials,
  OUTCOMES,
} = require('../../src/services/memberAuthService');
const { APPLICATION_STATUSES } = require('../../src/models/Member');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');
const { ROLES } = require('../../src/config/roles');

const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';

function member(overrides = {}) {
  return {
    _id: MEMBER_ID,
    passwordHash: 'stored-hash',
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
    ...overrides,
  };
}

const finding = (found) => async () => found;
const rightPassword = async () => true;
const wrongPassword = async () => false;
const CREDENTIALS = { email: 'comercio@cclu.cr', password: 'una-contrasena-larga' };

test('readCredentials refuses anything that is not a pair of strings', () => {
  assert.equal(readCredentials({ email: { $ne: null }, password: { $ne: null } }), null);
  assert.equal(readCredentials({ email: 'a@b.cr', password: { $gt: '' } }), null);
  assert.equal(readCredentials({ email: '  ', password: 'x' }), null);
  assert.equal(readCredentials(null), null);
});

test('an operator in the body never becomes a query', async () => {
  let searched = false;

  const result = await authenticateMember(
    { email: { $ne: null }, password: { $ne: null } },
    async () => {
      searched = true;
      return member();
    },
    rightPassword,
  );

  assert.equal(result.outcome, OUTCOMES.INVALID_CREDENTIALS);
  assert.equal(searched, false);
});

test('an approved and active member signs in', async () => {
  const result = await authenticateMember(CREDENTIALS, finding(member()), rightPassword);

  assert.equal(result.outcome, OUTCOMES.AUTHENTICATED);
  assert.deepEqual(result.identity, { id: MEMBER_ID, role: ROLES.MEMBER });
});

test('an unknown address and a wrong password answer identically', async () => {
  const unknown = await authenticateMember(CREDENTIALS, finding(null), wrongPassword);
  const wrong = await authenticateMember(CREDENTIALS, finding(member()), wrongPassword);

  assert.deepEqual(unknown, wrong);
  assert.equal(unknown.outcome, OUTCOMES.INVALID_CREDENTIALS);
});

test('an unknown address still costs a password verification', async () => {
  let verifications = 0;

  await authenticateMember(CREDENTIALS, finding(null), async () => {
    verifications += 1;
    return false;
  });

  assert.equal(verifications, 1);
});

test('a pending application is explained, but only once the password was right', async () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.PENDING_REVIEW,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
  ]) {
    const explained = await authenticateMember(
      CREDENTIALS,
      finding(member({ applicationStatus })),
      rightPassword,
    );
    const silent = await authenticateMember(
      CREDENTIALS,
      finding(member({ applicationStatus })),
      wrongPassword,
    );

    assert.equal(explained.outcome, OUTCOMES.APPLICATION_PENDING);
    assert.equal(silent.outcome, OUTCOMES.INVALID_CREDENTIALS);
  }
});

test('a rejected application is explained, and says nothing on a wrong password', async () => {
  const rejected = member({ applicationStatus: APPLICATION_STATUSES.REJECTED });

  assert.equal(
    (await authenticateMember(CREDENTIALS, finding(rejected), rightPassword)).outcome,
    OUTCOMES.APPLICATION_REJECTED,
  );
  assert.equal(
    (await authenticateMember(CREDENTIALS, finding(rejected), wrongPassword)).outcome,
    OUTCOMES.INVALID_CREDENTIALS,
  );
});

test('a suspended account is refused although the application was approved', async () => {
  const suspended = member({ accountStatus: ACCOUNT_STATUSES.SUSPENDED });

  assert.equal(
    (await authenticateMember(CREDENTIALS, finding(suspended), rightPassword)).outcome,
    OUTCOMES.ACCOUNT_SUSPENDED,
  );
});

test('nothing about the account escapes when the password was wrong', async () => {
  const result = await authenticateMember(
    CREDENTIALS,
    finding(member({ applicationStatus: APPLICATION_STATUSES.REJECTED })),
    wrongPassword,
  );

  assert.deepEqual(Object.keys(result), ['outcome']);
  assert.equal(result.identity, undefined);
});
