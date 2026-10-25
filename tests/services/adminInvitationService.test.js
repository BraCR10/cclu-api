const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const adminInvitationService = require('../../src/services/adminInvitationService');
const adminDirectoryService = require('../../src/services/adminDirectoryService');
const { digestOf } = adminDirectoryService;

const NOW = new Date('2026-10-24T15:00:00Z');
const TOKEN = randomBytes(32).toString('hex');

function admin(overrides = {}) {
  return {
    _id: '64b7f0a1c2d3e4f5a6b7c8da',
    name: 'Ana Solano',
    email: 'ana@camaralaunion.com',
    accountStatus: 'invitation_pending',
    invitationExpiresAt: new Date('2026-10-30T15:00:00Z'),
    invitationTokenHash: digestOf(TOKEN),
    ...overrides,
  };
}

function makeStore(row = admin()) {
  const writes = [];

  return {
    writes,
    findByToken: async (hash) => (row && row.invitationTokenHash === hash ? row : null),
    update: async (id, changes) => {
      writes.push({ id, changes });
    },
  };
}

test('a valid link opens the form with the address it was sent to', async () => {
  const store = makeStore();

  const invitation = await adminInvitationService.readInvitation(TOKEN, NOW, store);

  assert.equal(invitation.email, 'ana@camaralaunion.com');
  assert.equal(invitation.name, 'Ana Solano');
  // The sentence under the button names the day the link stops working.
  assert.equal(invitation.expiresAt.toISOString(), '2026-10-30T15:00:00.000Z');
});

// Outside /admin on purpose: the panel's layout turns away anybody without a
// session, and the person holding the link has no account yet.
test('the link the email carries opens the public page, not the guarded panel', () => {
  assert.equal(
    adminDirectoryService.invitationUrlFor('abc123', 'https://cclu.cr/'),
    'https://cclu.cr/invitation/abc123',
  );
});

test('an invitation past its day no longer opens anything', async () => {
  const store = makeStore(admin({ invitationExpiresAt: new Date('2026-10-01') }));

  await assert.rejects(
    adminInvitationService.readInvitation(TOKEN, NOW, store),
    (error) => error.code === 'invalid_code' && error.statusCode === 404,
  );
});

test('a link that is not a link answers the same as an expired one', async () => {
  const store = makeStore();

  await assert.rejects(
    adminInvitationService.readInvitation('no-es-un-token', NOW, store),
    (error) => error.code === 'invalid_code',
  );
});

test('accepting sets the password, opens the panel and burns the link', async () => {
  const store = makeStore();

  const accepted = await adminInvitationService.acceptInvitation(
    TOKEN,
    { password: 'Camara2026!' },
    NOW,
    store,
  );

  assert.equal(accepted.email, 'ana@camaralaunion.com');
  const [{ changes }] = store.writes;

  assert.equal(changes.accountStatus, 'active');
  assert.equal(changes.invitationTokenHash, null);
  assert.notEqual(changes.passwordHash, undefined);
  // The password itself is never stored.
  assert.notEqual(changes.passwordHash, 'Camara2026!');
});

test('a password that does not meet the three rules is refused on the field', async () => {
  const store = makeStore();

  await assert.rejects(
    adminInvitationService.acceptInvitation(TOKEN, { password: 'corta' }, NOW, store),
    (error) => error.field === 'password',
  );

  assert.equal(store.writes.length, 0);
});

test('a used invitation cannot be accepted again', async () => {
  const store = makeStore();

  await adminInvitationService.acceptInvitation(TOKEN, { password: 'Camara2026!' }, NOW, store);

  // The API clears the digest in the same write, so the token stops matching.
  store.findByToken = async () => null;

  await assert.rejects(
    adminInvitationService.acceptInvitation(TOKEN, { password: 'Camara2026!' }, NOW, store),
    (error) => error.code === 'invalid_code',
  );
});
