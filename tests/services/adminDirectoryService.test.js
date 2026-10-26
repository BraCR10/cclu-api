const test = require('node:test');
const assert = require('node:assert/strict');
const adminDirectoryService = require('../../src/services/adminDirectoryService');

const NOW = new Date('2026-10-24T15:00:00Z');
const ACTOR_ID = '64b7f0a1c2d3e4f5a6b7c8d9';
const ADMIN_ID = '64b7f0a1c2d3e4f5a6b7c8da';

// The API builds the link from where the site answers, which the deployment
// sets and a test has to stand in for.
process.env.WEB_ORIGIN = 'https://camaralaunion.example';

function admin(overrides = {}) {
  return {
    _id: ADMIN_ID,
    name: 'Ana Solano',
    email: 'ana@camaralaunion.com',
    accountStatus: 'active',
    invitationExpiresAt: null,
    invitationTokenHash: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makeStore(rows = [admin()]) {
  const sent = [];
  const list = rows.slice();

  return {
    rows: list,
    sent,
    list: async () => list,
    findById: async (id) => list.find((row) => row._id === id) ?? null,
    findByEmail: async (email) => list.find((row) => row.email === email)?._id ?? null,
    create: async (fields) => {
      const created = admin({ ...fields, _id: `created-${list.length}` });

      list.push(created);

      return created;
    },
    update: async (id, changes) => {
      const row = list.find((candidate) => candidate._id === id);

      Object.assign(row, changes);

      return row;
    },
    heldByOtherRole: async () => false,
    send: async (templateName, to, data) => sent.push({ templateName, to, data }),
  };
}

const ACTOR = admin({ _id: ACTOR_ID, name: 'Mariana Solís', email: 'mariana@camaralaunion.com' });

test('an invitation is created pending and mailed with a link', async () => {
  const store = makeStore([ACTOR]);

  const created = await adminDirectoryService.inviteAdmin(
    ACTOR_ID,
    { name: 'Ana Solano', email: 'Ana@CamaraLaUnion.com' },
    NOW,
    store,
  );

  assert.equal(created.status, 'invitation_pending');
  assert.equal(created.email, 'ana@camaralaunion.com');
  assert.equal(store.sent.length, 1);
  assert.equal(store.sent[0].templateName, 'adminInvitation');
  assert.equal(store.sent[0].to, 'ana@camaralaunion.com');
  assert.match(store.sent[0].data.invitationUrl, /\/invitation\/[0-9a-f]{64}$/);
  assert.equal(store.sent[0].data.invitedBy, 'Mariana Solís');
});

test('an address that already opens an account is refused on the field', async () => {
  const store = makeStore([ACTOR]);
  store.heldByOtherRole = async () => true;

  await assert.rejects(
    adminDirectoryService.inviteAdmin(
      ACTOR_ID,
      { name: 'Ana Solano', email: 'ana@example.com' },
      NOW,
      store,
    ),
    (error) => error.code === 'already_registered' && error.field === 'email',
  );
});

test('the same address cannot be invited twice', async () => {
  const store = makeStore([ACTOR]);

  await assert.rejects(
    adminDirectoryService.inviteAdmin(
      ACTOR_ID,
      { name: 'Mariana otra vez', email: 'mariana@camaralaunion.com' },
      NOW,
      store,
    ),
    (error) => error.code === 'already_registered',
  );
});

test('an invitation with no name is refused', async () => {
  const store = makeStore([ACTOR]);

  await assert.rejects(
    adminDirectoryService.inviteAdmin(ACTOR_ID, { email: 'ana@example.com' }, NOW, store),
    (error) => error.code === 'required' && error.field === 'name',
  );
});

// The directory reads the state that is true now, not the one that was written
// when the invitation went out.
test('an invitation past its day reads as expired', async () => {
  const store = makeStore([
    admin({ accountStatus: 'invitation_pending', invitationExpiresAt: new Date('2026-10-01') }),
  ]);

  const { items } = await adminDirectoryService.listAdmins(NOW, store);

  assert.equal(items[0].status, 'invitation_expired');
});

test('the directory says when each administrator last signed in', async () => {
  const signedIn = new Date('2026-10-24T14:00:00Z');
  const store = makeStore([admin({ lastSignInAt: signedIn }), admin({ _id: 'never' })]);

  const { items } = await adminDirectoryService.listAdmins(NOW, store);

  assert.equal(items[0].lastSignInAt, signedIn);
  assert.equal(items[1].lastSignInAt, null);
});

test('resending starts the clock again and mails a new link', async () => {
  const store = makeStore([
    ACTOR,
    admin({
      _id: 'pending',
      accountStatus: 'invitation_pending',
      invitationExpiresAt: new Date('2026-10-01'),
    }),
  ]);

  const resent = await adminDirectoryService.resendInvitation(ACTOR_ID, 'pending', NOW, store);

  assert.equal(resent.status, 'invitation_pending');
  assert.ok(resent.invitationExpiresAt > NOW);
  assert.equal(store.sent.length, 1);
});

test('there is no invitation to resend once the admin has a password', async () => {
  const store = makeStore([ACTOR]);

  await assert.rejects(
    adminDirectoryService.resendInvitation(ACTOR_ID, ACTOR_ID, NOW, store),
    (error) => error.code === 'not_allowed',
  );
});

test('an administrator inactivates and reactivates another', async () => {
  const store = makeStore([ACTOR, admin({ _id: 'other' })]);

  const down = await adminDirectoryService.setAdminStatus(
    ACTOR_ID,
    'other',
    { status: 'inactive' },
    NOW,
    store,
  );
  const up = await adminDirectoryService.setAdminStatus(
    ACTOR_ID,
    'other',
    { status: 'active' },
    NOW,
    store,
  );

  assert.equal(down.status, 'inactive');
  assert.equal(up.status, 'active');
});

test('an administrator cannot inactivate themselves', async () => {
  const store = makeStore([ACTOR]);

  await assert.rejects(
    adminDirectoryService.setAdminStatus(ACTOR_ID, ACTOR_ID, { status: 'inactive' }, NOW, store),
    (error) => error.code === 'not_allowed',
  );
});
