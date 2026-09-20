const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requestResetFromSession,
  requestForgottenPassword,
  completePasswordReset,
  readResetRequest,
  findAccountByEmail,
  resetUrlFor,
  digestOf,
  MINUTES_VALID,
} = require('../../src/services/passwordResetService');
const { ValidationError } = require('../../src/config/memberRules');
const { hashPassword, verifyPassword } = require('../../src/services/passwordService');
const { ROLES } = require('../../src/config/roles');

// resetUrlFor reads it, and without one the message would carry no link at all.
process.env.WEB_ORIGIN = 'https://cclu.example';

const CURRENT_PASSWORD = 'Contrasena.1';
const NEW_PASSWORD = 'Contrasena.2';

async function account(overrides = {}) {
  return {
    _id: '65f0c3a1b2c3d4e5f6a7b8c9',
    email: 'socio@example.cr',
    passwordHash: await hashPassword(CURRENT_PASSWORD),
    save: async () => {},
    ...overrides,
  };
}

function collector() {
  const saved = [];
  const sent = [];

  return {
    saved,
    sent,
    save: async (id, role, fields) => saved.push({ id, role, fields }),
    sendEmail: async (template, recipient, data) => sent.push({ template, recipient, data }),
  };
}

test('a link is only issued once the current password was right', async () => {
  const found = await account();
  const { saved, sent, save, sendEmail } = collector();

  const answer = await requestResetFromSession(
    { id: found._id, role: ROLES.MEMBER },
    { currentPassword: CURRENT_PASSWORD },
    async () => found,
    save,
    sendEmail,
  );

  assert.deepEqual(answer, { minutesValid: MINUTES_VALID });
  assert.equal(saved.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].template, 'passwordResetLink');
  assert.equal(sent[0].recipient, found.email);
});

// Holding somebody's open session must not be enough to make the chamber send
// them a link.
test('a wrong current password issues nothing and sends nothing', async () => {
  const found = await account();
  const { saved, sent, save, sendEmail } = collector();

  await assert.rejects(
    requestResetFromSession(
      { id: found._id, role: ROLES.MEMBER },
      { currentPassword: 'otra-cosa' },
      async () => found,
      save,
      sendEmail,
    ),
    (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.field, 'currentPassword');
      return true;
    },
  );

  assert.equal(saved.length, 0);
  assert.equal(sent.length, 0);
});

// The token is what travels; the digest is what is kept. A copy of the
// collection has to open nothing.
test('the token never reaches the database and the link never reaches the record', async () => {
  const found = await account();
  const { saved, sent, save, sendEmail } = collector();

  await requestResetFromSession(
    { id: found._id, role: ROLES.MEMBER },
    { currentPassword: CURRENT_PASSWORD },
    async () => found,
    save,
    sendEmail,
  );

  const token = sent[0].data.resetUrl.split('/').pop();

  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(saved[0].fields.tokenDigest, digestOf(token));
  assert.ok(!JSON.stringify(saved[0].fields).includes(token));
});

test('the record carries no attempt counter, because there is nothing to guess', async () => {
  const found = await account();
  const { saved, save, sendEmail } = collector();

  await requestResetFromSession(
    { id: found._id, role: ROLES.MEMBER },
    { currentPassword: CURRENT_PASSWORD },
    async () => found,
    save,
    sendEmail,
  );

  assert.ok(!('attempts' in saved[0].fields));
});

// Told apart, this becomes a way of asking the chamber who belongs to it.
test('a forgotten password answers the same for an address that is not an account', async () => {
  const { sent, save, sendEmail } = collector();

  const known = await requestForgottenPassword(
    { email: 'socio@example.cr' },
    async () => ({ account: await account(), role: ROLES.MEMBER }),
    save,
    sendEmail,
  );

  const unknown = await requestForgottenPassword(
    { email: 'nadie@example.cr' },
    async () => null,
    save,
    sendEmail,
  );

  assert.deepEqual(known, unknown);
  assert.equal(sent.length, 1);
});

// An address that opens two accounts has no single answer, and guessing would
// reset the wrong one and leave the other unrecoverable.
test('an address that opens two accounts answers with neither', async () => {
  const holds = (email) => ({
    findOne: () => ({ select: async () => ({ _id: 'x', email }) }),
  });
  const holdsNobody = { findOne: () => ({ select: async () => null }) };

  const ambiguous = await findAccountByEmail('ambas@example.cr', {
    [ROLES.MEMBER]: holds('ambas@example.cr'),
    [ROLES.ADMIN]: holds('ambas@example.cr'),
  });

  assert.equal(ambiguous, null);

  // One holder still answers, or the rule would break every ordinary reset.
  const single = await findAccountByEmail('socio@example.cr', {
    [ROLES.MEMBER]: holds('socio@example.cr'),
    [ROLES.ADMIN]: holdsNobody,
  });

  assert.equal(single.role, ROLES.MEMBER);
});

test('a token of the wrong shape is refused before anything is looked up', async () => {
  let looked = false;

  for (const token of [undefined, '', 'corto', 'z'.repeat(64), { $ne: null }]) {
    await assert.rejects(
      readResetRequest(token, async () => {
        looked = true;
        return null;
      }),
      ValidationError,
    );
  }

  assert.equal(looked, false);
});

// The database sweeps expired documents on its own schedule, so one may still
// be here when it is asked for.
test('an expired link is refused although its record still exists', async () => {
  const expired = {
    tokenDigest: digestOf('a'.repeat(64)),
    expiresAt: new Date(Date.now() - 1000),
  };

  await assert.rejects(
    readResetRequest('a'.repeat(64), async () => expired),
    ValidationError,
  );
});

test('the new password is set and the link is spent', async () => {
  const found = await account();
  let deleted = false;
  let stored = null;

  const request = {
    account: found._id,
    role: ROLES.MEMBER,
    tokenDigest: digestOf('b'.repeat(64)),
    expiresAt: new Date(Date.now() + 60_000),
    deleteOne: async () => {
      deleted = true;
    },
  };

  const answer = await completePasswordReset(
    { token: 'b'.repeat(64), newPassword: NEW_PASSWORD },
    async () => request,
    {
      [ROLES.MEMBER]: {
        findById: async () => ({
          ...found,
          save: async function save() {
            stored = this.passwordHash;
          },
        }),
      },
    },
  );

  assert.deepEqual(answer, { changed: true });
  assert.equal(deleted, true);
  assert.equal(await verifyPassword(NEW_PASSWORD, stored), true);
  assert.equal(await verifyPassword(CURRENT_PASSWORD, stored), false);
});

test('a password the rules refuse never reaches the account', async () => {
  const request = {
    account: 'x',
    role: ROLES.MEMBER,
    tokenDigest: digestOf('c'.repeat(64)),
    expiresAt: new Date(Date.now() + 60_000),
    deleteOne: async () => assert.fail('the link was spent on a refused password'),
  };

  await assert.rejects(
    completePasswordReset({ token: 'c'.repeat(64), newPassword: 'corta' }, async () => request, {
      [ROLES.MEMBER]: { findById: async () => assert.fail('the account was read') },
    }),
    ValidationError,
  );
});

test('the link points at the site rather than at the API', () => {
  assert.equal(
    resetUrlFor('abc', 'https://cclu.example/'),
    'https://cclu.example/password/reset/abc',
  );
});

// Passing undefined falls back to the environment, so the only way to reach the
// unconfigured case is to take it away.
test('with nowhere configured to send anyone, no link is invented', () => {
  const configured = process.env.WEB_ORIGIN;

  delete process.env.WEB_ORIGIN;

  try {
    assert.equal(resetUrlFor('abc'), undefined);
  } finally {
    process.env.WEB_ORIGIN = configured;
  }
});
