const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readOwnProfile,
  updateOwnProfile,
  present,
} = require('../../src/services/adminProfileService');
const { ValidationError } = require('../../src/config/memberRules');
const { ACCOUNT_STATUSES } = require('../../src/config/accountStatus');

function stored(overrides = {}) {
  return {
    _id: '65f0c3a1b2c3d4e5f6a7b8c9',
    name: 'Ana Rojas',
    email: 'admin@example.cr',
    passwordHash: '$2b$12$notarealhash',
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
    ...overrides,
  };
}

// Built field by field rather than by removing what must not travel. A filtered
// document still reaches the browser with whatever nobody remembered to remove.
test('the answer carries no password hash, however the document arrived', () => {
  const answer = present(stored());

  assert.equal('passwordHash' in answer, false);
  assert.deepEqual(Object.keys(answer).sort(), ['accountStatus', 'email', 'id', 'name'].sort());
});

test('an administrator created before names existed answers with null, not undefined', () => {
  const answer = present(stored({ name: undefined }));

  assert.equal(answer.name, null);
});

test('an account that no longer exists is refused rather than answered empty', async () => {
  await assert.rejects(
    readOwnProfile({ id: 'x' }, async () => null),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    },
  );
});

// Named explicitly rather than taken from the body, so a request carrying an
// address, a role or a password hash is simply never read.
test('nothing but the name is written, whatever else the body carried', async () => {
  let written = null;

  await updateOwnProfile(
    { id: 'x' },
    {
      name: 'Ana Rojas',
      email: 'otra@example.cr',
      accountStatus: ACCOUNT_STATUSES.SUSPENDED,
      passwordHash: 'lo-que-sea',
      role: 'admin',
    },
    async (id, fields) => {
      written = fields;
      return stored();
    },
  );

  assert.deepEqual(written, { name: 'Ana Rojas' });
});

test('a name longer than the rules allow is refused before anything is written', async () => {
  await assert.rejects(
    updateOwnProfile({ id: 'x' }, { name: 'a'.repeat(121) }, async () =>
      assert.fail('the account was written'),
    ),
    ValidationError,
  );
});

test('a body that is not an object is refused rather than read', async () => {
  for (const body of [null, undefined, 'texto', [], 42]) {
    await assert.rejects(
      updateOwnProfile({ id: 'x' }, body, async () => assert.fail('the account was written')),
      ValidationError,
    );
  }
});

test('a name that is only spaces is refused, since it would greet nobody', async () => {
  await assert.rejects(
    updateOwnProfile({ id: 'x' }, { name: '   ' }, async () =>
      assert.fail('the account was written'),
    ),
    ValidationError,
  );
});
