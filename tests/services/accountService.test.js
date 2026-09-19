const test = require('node:test');
const assert = require('node:assert/strict');
const { isIdentityUsable, ACCOUNT_RULES } = require('../../src/services/accountService');
const { ROLES } = require('../../src/config/roles');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');
const { APPLICATION_STATUSES } = require('../../src/models/Agremiado');

const agremiadoRule = ACCOUNT_RULES[ROLES.AGREMIADO];
const administradorRule = ACCOUNT_RULES[ROLES.ADMINISTRADOR];

test('an agremiado needs both an approved application and an active account', () => {
  assert.equal(
    agremiadoRule.isUsable({
      accountStatus: ACCOUNT_STATUSES.ACTIVA,
      applicationStatus: APPLICATION_STATUSES.APPROVED,
    }),
    true,
  );
});

test('a suspended agremiado is refused even though the application was approved', () => {
  assert.equal(
    agremiadoRule.isUsable({
      accountStatus: ACCOUNT_STATUSES.SUSPENDIDA,
      applicationStatus: APPLICATION_STATUSES.APPROVED,
    }),
    false,
  );
});

test('an agremiado whose application never succeeded is refused while active', () => {
  for (const applicationStatus of [
    APPLICATION_STATUSES.PENDING_REVIEW,
    APPLICATION_STATUSES.CHANGES_REQUESTED,
    APPLICATION_STATUSES.REJECTED,
  ]) {
    assert.equal(
      agremiadoRule.isUsable({ accountStatus: ACCOUNT_STATUSES.ACTIVA, applicationStatus }),
      false,
    );
  }
});

test('an administrador is judged on the account alone, having no application', () => {
  assert.equal(administradorRule.isUsable({ accountStatus: ACCOUNT_STATUSES.ACTIVA }), true);
  assert.equal(administradorRule.isUsable({ accountStatus: ACCOUNT_STATUSES.SUSPENDIDA }), false);
});

test('isIdentityUsable looks the account up by the identifier in the token', async () => {
  const asked = [];
  const rules = {
    [ROLES.AGREMIADO]: {
      find: (id) => {
        asked.push(id);
        return Promise.resolve({ accountStatus: ACCOUNT_STATUSES.ACTIVA });
      },
      isUsable: () => true,
    },
  };

  const usable = await isIdentityUsable({ id: 'abc123', role: ROLES.AGREMIADO }, rules);

  assert.equal(usable, true);
  assert.deepEqual(asked, ['abc123']);
});

test('isIdentityUsable refuses an account that no longer exists', async () => {
  const rules = {
    [ROLES.AGREMIADO]: { find: () => Promise.resolve(null), isUsable: () => true },
  };

  assert.equal(await isIdentityUsable({ id: 'abc123', role: ROLES.AGREMIADO }, rules), false);
});

test('isIdentityUsable refuses a role it has no rule for', async () => {
  const rules = {
    [ROLES.AGREMIADO]: { find: () => Promise.resolve({}), isUsable: () => true },
  };

  assert.equal(await isIdentityUsable({ id: 'abc123', role: 'inventado' }, rules), false);
  assert.equal(await isIdentityUsable({ id: 'abc123' }, rules), false);
  assert.equal(await isIdentityUsable(undefined, rules), false);
});
