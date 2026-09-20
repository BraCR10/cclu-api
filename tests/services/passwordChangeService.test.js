const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requestPasswordChange,
  confirmPasswordChange,
  MINUTES_VALID,
  MAXIMUM_ATTEMPTS,
} = require('../../src/services/passwordChangeService');
const passwordService = require('../../src/services/passwordService');
const { ROLES } = require('../../src/config/roles');

const IDENTITY = { id: '65f0c3a1b2c3d4e5f6a7b8c9', role: ROLES.MEMBER };
const CURRENT = 'Actual123!';
const NEW = 'Nueva456$';

async function account(overrides = {}) {
  return {
    _id: IDENTITY.id,
    email: 'socio@example.cr',
    passwordHash: await passwordService.hashPassword(CURRENT),
    saved: false,
    async save() {
      this.saved = true;
    },
    ...overrides,
  };
}

function storedRequest(codeHash, overrides = {}) {
  return {
    codeHash,
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    deleted: false,
    async save() {},
    async deleteOne() {
      this.deleted = true;
    },
    ...overrides,
  };
}

async function refusal(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('a wrong current password sends nothing and stores nothing', async () => {
  const sent = [];
  const saved = [];

  const error = await refusal(() =>
    requestPasswordChange(
      IDENTITY,
      { currentPassword: 'no-es-la-actual' },
      async () => account(),
      async (...call) => sent.push(call),
      async (...call) => saved.push(call),
    ),
  );

  assert.equal(error.statusCode, 401);
  assert.equal(sent.length, 0);
  assert.equal(saved.length, 0);
});

test('a current password that is not even text is refused the same way', async () => {
  for (const currentPassword of [undefined, null, { $ne: null }, 12345678]) {
    const error = await refusal(() =>
      requestPasswordChange(
        IDENTITY,
        { currentPassword },
        async () => account(),
        async () => {},
        async () => {},
      ),
    );

    assert.equal(error.statusCode, 401);
  }
});

test('the right current password mails a six digit code and stores only its hash', async () => {
  const sent = [];
  const saved = [];

  const answer = await requestPasswordChange(
    IDENTITY,
    { currentPassword: CURRENT },
    async () => account(),
    async (template, address, data) => sent.push({ template, address, data }),
    async (accountId, role, fields) => saved.push({ accountId, role, fields }),
  );

  assert.equal(answer.minutesValid, MINUTES_VALID);
  assert.equal(sent[0].template, 'passwordChangeCode');
  assert.equal(sent[0].address, 'socio@example.cr');
  assert.match(sent[0].data.code, /^[0-9]{6}$/);

  // The code travelled to the person and its hash to the database, never the
  // code itself.
  assert.notEqual(saved[0].fields.codeHash, sent[0].data.code);
  assert.equal(
    await passwordService.verifyPassword(sent[0].data.code, saved[0].fields.codeHash),
    true,
  );
  assert.equal(saved[0].fields.attempts, 0);
  assert.ok(saved[0].fields.expiresAt > new Date());
});

// Delivery is the operation, not a notice beside it: without the message the
// person cannot continue, so a silent success would strand them.
test('a message that does not leave fails the request', async () => {
  const error = await refusal(() =>
    requestPasswordChange(
      IDENTITY,
      { currentPassword: CURRENT },
      async () => account(),
      async () => {
        throw new Error('the server refused the connection');
      },
      async () => {},
    ),
  );

  assert.match(error.message, /connection/);
});

test('a code that is not six digits never reaches the database', async () => {
  for (const code of [undefined, null, '', '12345', '1234567', 'abcdef', { $ne: null }, 123456]) {
    let looked = false;

    await refusal(() =>
      confirmPasswordChange(
        IDENTITY,
        { code, newPassword: NEW },
        async () => account(),
        async () => {
          looked = true;
          return null;
        },
      ),
    );

    assert.equal(looked, false);
  }
});

test('the new password answers to the same policy as a registration', async () => {
  for (const newPassword of ['corta1!', '12345678', 'abcdefgh', 'abcd1234']) {
    const error = await refusal(() =>
      confirmPasswordChange(
        IDENTITY,
        { code: '123456', newPassword },
        async () => account(),
        async () => null,
      ),
    );

    assert.equal(error.statusCode, 400);
    assert.match(error.code, /^password_/);
  }
});

test('a wrong code is counted and the password stays as it was', async () => {
  const held = await account();
  const request = storedRequest(await passwordService.hashPassword('111111'));

  const error = await refusal(() =>
    confirmPasswordChange(
      IDENTITY,
      { code: '999999', newPassword: NEW },
      async () => held,
      async () => request,
    ),
  );

  assert.equal(error.code, 'invalid_code');
  assert.equal(request.attempts, 1);
  assert.equal(held.saved, false);
});

test('a code that ran out of time is refused although the record survived', async () => {
  const request = storedRequest(await passwordService.hashPassword('123456'), {
    expiresAt: new Date(Date.now() - 1000),
  });

  const error = await refusal(() =>
    confirmPasswordChange(
      IDENTITY,
      { code: '123456', newPassword: NEW },
      async () => account(),
      async () => request,
    ),
  );

  assert.equal(error.code, 'invalid_code');
});

test('guessing stops after the allowed attempts and the code is thrown away', async () => {
  const request = storedRequest(await passwordService.hashPassword('123456'), {
    attempts: MAXIMUM_ATTEMPTS,
  });

  const error = await refusal(() =>
    confirmPasswordChange(
      IDENTITY,
      { code: '123456', newPassword: NEW },
      async () => account(),
      async () => request,
    ),
  );

  assert.match(error.message, /Too many attempts/);
  assert.equal(request.deleted, true);
});

test('the right code stores the new password and spends the code', async () => {
  const held = await account();
  const request = storedRequest(await passwordService.hashPassword('123456'));
  const previousHash = held.passwordHash;

  const answer = await confirmPasswordChange(
    IDENTITY,
    { code: ' 123456 ', newPassword: NEW },
    async () => held,
    async () => request,
  );

  assert.deepEqual(answer, { changed: true });
  assert.equal(held.saved, true);
  assert.notEqual(held.passwordHash, previousHash);
  assert.equal(await passwordService.verifyPassword(NEW, held.passwordHash), true);
  assert.equal(request.deleted, true);
});

test('an account that vanished between the gate and the change is a not found', async () => {
  for (const work of [
    () =>
      requestPasswordChange(
        IDENTITY,
        { currentPassword: CURRENT },
        async () => null,
        async () => {},
        async () => {},
      ),
    () =>
      confirmPasswordChange(
        IDENTITY,
        { code: '123456', newPassword: NEW },
        async () => null,
        async () => null,
      ),
  ]) {
    assert.equal((await refusal(work)).statusCode, 404);
  }
});
