const test = require('node:test');
const assert = require('node:assert/strict');
const { isIdentityUsable, ACCOUNT_RULES } = require('../../src/services/accountService');
const { ROLES } = require('../../src/config/roles');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');
const { APPLICATION_STATUSES } = require('../../src/models/Member');

const memberRule = ACCOUNT_RULES[ROLES.MEMBER];
const adminRule = ACCOUNT_RULES[ROLES.ADMIN];

test('a member needs both an approved application and an active account', () => {
  assert.equal(
    memberRule.isUsable({
      accountStatus: ACCOUNT_STATUSES.ACTIVE,
      applicationStatus: APPLICATION_STATUSES.APPROVED,
    }),
    true,
  );
});

test('a suspended member is refused even though the application was approved', () => {
  assert.equal(
    memberRule.isUsable({
      accountStatus: ACCOUNT_STATUSES.SUSPENDED,
      applicationStatus: APPLICATION_STATUSES.APPROVED,
    }),
    false,
  );
});

test('a member whose application never succeeded is refused while active', () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.PENDING_REVIEW,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
    APPLICATION_STATUSES.REJECTED,
  ]) {
    assert.equal(
      memberRule.isUsable({ accountStatus: ACCOUNT_STATUSES.ACTIVE, applicationStatus }),
      false,
    );
  }
});

test('an admin is judged on the account alone, having no application', () => {
  assert.equal(adminRule.isUsable({ accountStatus: ACCOUNT_STATUSES.ACTIVE }), true);
  assert.equal(adminRule.isUsable({ accountStatus: ACCOUNT_STATUSES.SUSPENDED }), false);
});

test('isIdentityUsable looks the account up by the identifier in the token', async () => {
  const asked = [];
  const rules = {
    [ROLES.MEMBER]: {
      find: (id) => {
        asked.push(id);
        return Promise.resolve({ accountStatus: ACCOUNT_STATUSES.ACTIVE });
      },
      isUsable: () => true,
    },
  };

  const usable = await isIdentityUsable({ id: 'abc123', role: ROLES.MEMBER }, rules);

  assert.equal(usable, true);
  assert.deepEqual(asked, ['abc123']);
});

test('isIdentityUsable refuses an account that no longer exists', async () => {
  const rules = {
    [ROLES.MEMBER]: { find: () => Promise.resolve(null), isUsable: () => true },
  };

  assert.equal(await isIdentityUsable({ id: 'abc123', role: ROLES.MEMBER }, rules), false);
});

test('isIdentityUsable refuses a role it has no rule for', async () => {
  const rules = {
    [ROLES.MEMBER]: { find: () => Promise.resolve({}), isUsable: () => true },
  };

  assert.equal(await isIdentityUsable({ id: 'abc123', role: 'inventado' }, rules), false);
  assert.equal(await isIdentityUsable({ id: 'abc123' }, rules), false);
  assert.equal(await isIdentityUsable(undefined, rules), false);
});
