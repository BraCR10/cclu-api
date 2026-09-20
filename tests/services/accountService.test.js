const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isIdentityUsable,
  describeCurrentAccount,
  effectiveMemberState,
  canUseAccount,
  MEMBER_STATES,
  ACCOUNT_RULES,
} = require('../../src/services/accountService');
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

const active = ACCOUNT_STATUSES.ACTIVE;
const suspended = ACCOUNT_STATUSES.SUSPENDED;

test('an application still being decided reads as under review, never as active', () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.PENDING_REVIEW,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
  ]) {
    assert.equal(
      effectiveMemberState({ applicationStatus, accountStatus: active }),
      MEMBER_STATES.UNDER_REVIEW,
    );
  }
});

// This is the pair that reads wrong on the raw record: rejected and active at
// once. What a screen shows must be the second word, never the first.
test('a rejected application reads as rejected although the account was never suspended', () => {
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.REJECTED,
      accountStatus: active,
    }),
    MEMBER_STATES.REJECTED,
  );
});

test('a rejection outlives a later suspension', () => {
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.REJECTED,
      accountStatus: suspended,
    }),
    MEMBER_STATES.REJECTED,
  );
});

test('only an approved application that is not suspended reads as active', () => {
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.APPROVED,
      accountStatus: active,
    }),
    MEMBER_STATES.ACTIVE,
  );
  assert.equal(
    effectiveMemberState({
      applicationStatus: APPLICATION_STATUSES.APPROVED,
      accountStatus: suspended,
    }),
    MEMBER_STATES.SUSPENDED,
  );
});

test('exactly one state opens the door', () => {
  const combinations = [];

  for (const applicationStatus of Object.values(APPLICATION_STATUSES)) {
    for (const accountStatus of Object.values(ACCOUNT_STATUSES)) {
      combinations.push({ applicationStatus, accountStatus });
    }
  }

  const usable = combinations.filter(canUseAccount);

  assert.equal(usable.length, 1);
  assert.deepEqual(usable[0], {
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
  });
});

const describing = (details) => ({
  [ROLES.MEMBER]: { describe: async () => details },
  [ROLES.ADMIN]: { describe: async () => details },
});

test('the account answers with what the session cannot carry', async () => {
  const account = await describeCurrentAccount(
    { id: 'abc', role: ROLES.MEMBER },
    describing({
      email: 'socio@cclu.cr',
      displayName: 'Panadería',
      memberCode: 'MA7K2Q4',
      state: 'active',
    }),
  );

  assert.deepEqual(account, {
    id: 'abc',
    role: ROLES.MEMBER,
    email: 'socio@cclu.cr',
    displayName: 'Panadería',
    memberCode: 'MA7K2Q4',
    state: 'active',
  });
});

// The gate above already proved the account was usable, so nothing here means
// it disappeared between the two.
test('an account that no longer exists is described as nothing', async () => {
  assert.equal(
    await describeCurrentAccount({ id: 'abc', role: ROLES.ADMIN }, describing(null)),
    null,
  );
});

test('a role the API does not issue is described as nothing', async () => {
  for (const identity of [undefined, null, {}, { id: 'abc' }, { id: 'abc', role: 'inventado' }]) {
    assert.equal(await describeCurrentAccount(identity, describing({ email: 'x@y.cr' })), null);
  }
});

test('an administrator is described without a member code or a state', async () => {
  const account = await describeCurrentAccount(
    { id: 'abc', role: ROLES.ADMIN },
    {
      [ROLES.ADMIN]: {
        describe: async () => ({ email: 'admin@cclu.cr', displayName: 'admin@cclu.cr' }),
      },
    },
  );

  assert.equal(account.memberCode, undefined);
  assert.equal(account.state, undefined);
});
