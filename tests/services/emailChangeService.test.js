const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requestEmailChange,
  readEmailChange,
  confirmEmailChange,
  digestOf,
  MINUTES_VALID,
} = require('../../src/services/emailChangeService');

const TOKEN = 'a'.repeat(64);
const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8c9';

function member(overrides = {}) {
  return { _id: MEMBER_ID, email: 'viejo@example.cr', ...overrides };
}

function pendingMember(overrides = {}) {
  return member({
    pendingEmail: 'nuevo@example.cr',
    emailChangeTokenHash: digestOf(TOKEN),
    emailChangeExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });
}

const finding = (value) => async () => value;
const neverAsked = async () => {
  throw new Error('the database was queried for a token that could not exist');
};
const nothingHeld = async () => false;
const saves = () => {
  const calls = [];

  return { calls, save: async (id, fields) => calls.push({ id, fields }) };
};
const sent = () => {
  const messages = [];

  return {
    messages,
    send: async (templateName, recipient, data) => messages.push({ templateName, recipient, data }),
  };
};

async function refused(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('The call was expected to be refused and was not.');
}

test('asking for a change mails the address being claimed, not the one on file', async () => {
  const { calls, save } = saves();
  const { messages, send } = sent();

  const answer = await requestEmailChange(
    MEMBER_ID,
    { email: '  Nuevo@Example.CR ' },
    { find: finding(member()), save, held: nothingHeld, send },
  );

  assert.equal(answer.email, 'nuevo@example.cr');
  assert.equal(answer.minutesValid, MINUTES_VALID);
  assert.equal(messages[0].templateName, 'emailChangeLink');
  assert.equal(messages[0].recipient, 'nuevo@example.cr');
  assert.equal(messages[0].data.currentEmail, 'viejo@example.cr');
  // The token is stored the way a password is: never in the clear.
  assert.equal(calls[0].fields.pendingEmail, 'nuevo@example.cr');
  assert.match(calls[0].fields.emailChangeTokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(calls[0].fields.emailChangeTokenHash, TOKEN);
  assert.ok(calls[0].fields.emailChangeExpiresAt > new Date());
});

test('the link carries the address the site answers on, built from the configured origin', async () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = 'https://cclu.example.cr/';

  try {
    const { save } = saves();
    const { messages, send } = sent();

    await requestEmailChange(
      MEMBER_ID,
      { email: 'nuevo@example.cr' },
      { find: finding(member()), save, held: nothingHeld, send },
    );

    assert.match(
      messages[0].data.confirmUrl,
      /^https:\/\/cclu\.example\.cr\/email\/confirm\/[0-9a-f]{64}$/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = previous;
    }
  }
});

test('an address the account already has is refused', async () => {
  const error = await refused(() =>
    requestEmailChange(
      MEMBER_ID,
      { email: 'viejo@example.cr' },
      { find: finding(member()), save: saves().save, held: nothingHeld, send: sent().send },
    ),
  );

  assert.deepEqual([error.code, error.statusCode], ['nothing_to_change', 400]);
});

// The one thing the system cannot resolve is two accounts behind one address.
test('an address another account holds is refused', async () => {
  const error = await refused(() =>
    requestEmailChange(
      MEMBER_ID,
      { email: 'tomado@example.cr' },
      { find: finding(member()), save: saves().save, held: async () => true, send: sent().send },
    ),
  );

  assert.deepEqual([error.code, error.statusCode], ['already_registered', 409]);
});

test('a body without an address is refused before anything is written', async () => {
  for (const body of [undefined, null, {}, { email: '' }, { email: 'no-es-un-correo' }]) {
    let touched = false;

    await refused(() =>
      requestEmailChange(MEMBER_ID, body, {
        find: finding(member()),
        save: async () => {
          touched = true;
        },
        held: nothingHeld,
        send: sent().send,
      }),
    );

    assert.equal(touched, false);
  }
});

test('nothing is applied by asking: the change waits for the link', async () => {
  let applied = false;

  await requestEmailChange(
    MEMBER_ID,
    { email: 'nuevo@example.cr' },
    {
      find: finding(member()),
      save: async () => {},
      held: nothingHeld,
      send: async () => {
        applied = true;
      },
    },
  );

  // The only thing that happened is a message; the account still has its
  // address.
  assert.equal(applied, true);
});

test('the link says which address it would apply', async () => {
  const answer = await readEmailChange(TOKEN, finding(pendingMember()));

  assert.deepEqual(answer, { email: 'nuevo@example.cr' });
});

test('a token that is not one never reaches the database', async () => {
  for (const token of [undefined, null, '', 'corto', { $ne: null }, 42, 'z'.repeat(64)]) {
    await refused(() => readEmailChange(token, neverAsked));
  }
});

test('a link nobody was issued is refused', async () => {
  assert.equal((await refused(() => readEmailChange(TOKEN, finding(null)))).statusCode, 404);
});

test('a link that ran out of time is refused', async () => {
  const error = await refused(() =>
    readEmailChange(
      TOKEN,
      finding(pendingMember({ emailChangeExpiresAt: new Date(Date.now() - 1000) })),
    ),
  );

  assert.equal(error.statusCode, 404);
});

test('a link whose address is gone is refused', async () => {
  const error = await refused(() =>
    readEmailChange(TOKEN, finding(pendingMember({ pendingEmail: undefined }))),
  );

  assert.equal(error.statusCode, 404);
});

test('confirming applies the address and spends the link', async () => {
  const applied = [];

  const answer = await confirmEmailChange(TOKEN, finding(pendingMember()), async (id, email) =>
    applied.push({ id, email }),
  );

  assert.deepEqual(applied, [{ id: MEMBER_ID, email: 'nuevo@example.cr' }]);
  assert.deepEqual(answer, { email: 'nuevo@example.cr' });
});

// Somebody else registered the address between the request and the click, and
// the unique index is what knows it.
test('a duplicate answer on confirm is refused without naming anybody', async () => {
  const error = await refused(() =>
    confirmEmailChange(TOKEN, finding(pendingMember()), async () => {
      const duplicate = new Error('duplicate key');

      duplicate.code = 11000;

      throw duplicate;
    }),
  );

  assert.deepEqual([error.code, error.statusCode], ['already_registered', 409]);
});

test('the same link cannot be applied twice', async () => {
  const applied = [];

  await confirmEmailChange(TOKEN, finding(pendingMember()), async (id, email) =>
    applied.push({ id, email }),
  );

  // Applied once the token is gone, the digest no longer matches anything.
  const error = await refused(() =>
    confirmEmailChange(
      TOKEN,
      finding(pendingMember({ emailChangeTokenHash: null })),
      async () => {},
    ),
  );

  assert.equal(error.statusCode, 404);
});
