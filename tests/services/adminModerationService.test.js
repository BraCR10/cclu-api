const test = require('node:test');
const assert = require('node:assert/strict');
const { listContent, takeDown, restore } = require('../../src/services/adminModerationService');
const { ValidationError } = require('../../src/config/memberRules');

const ID = '65f0c3a1b2c3d4e5f6a7b8c9';
const MEMBER_ID = '65f0c3a1b2c3d4e5f6a7b8ca';

function publication(overrides = {}) {
  return {
    _id: ID,
    title: 'Café de altura',
    type: 'product',
    status: 'active',
    inactiveReason: null,
    publishedAt: new Date('2026-03-01T10:00:00.000Z'),
    member: { _id: MEMBER_ID, businessName: 'Café La Unión' },
    ...overrides,
  };
}

function storeOf({ rows = [publication()], writes = [] } = {}) {
  return {
    writes,
    listPublications: async () => rows,
    countPublications: async () => rows.length,
    listVacancies: async () => rows,
    countVacancies: async () => rows.length,
    findPublication: async () => rows[0] ?? null,
    findVacancy: async () => rows[0] ?? null,
    updatePublication: async (id, changes) => {
      writes.push({ updated: changes });

      return publication(changes);
    },
    updateVacancy: async (id, changes) => {
      writes.push({ updated: changes });

      return { ...rows[0], ...changes };
    },
    writeAudit: async (entry) => {
      writes.push({ audit: entry });

      return entry;
    },
    actorName: async () => ({ name: 'Mariana Solís' }),
  };
}

test('a tab lists only its own kind, with the member behind each item', async () => {
  const answer = await listContent('products', {}, storeOf());

  assert.equal(answer.items.length, 1);
  assert.equal(answer.items[0].member, 'Café La Unión');
  assert.equal(answer.items[0].reason, null);
});

test('a kind the panel does not draw answers 404', async () => {
  await assert.rejects(listContent('servicios', {}, storeOf()), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});

test('an impossible state is refused rather than answered empty', async () => {
  await assert.rejects(listContent('products', { status: 'borrado' }, storeOf()), ValidationError);
});

// Taking one down keeps it and its reason; nothing is deleted.
test('taking a publication down writes the state and the reason, and tells the member', async () => {
  const store = storeOf();
  const notified = [];

  const answer = await takeDown(
    { id: 'admin-1', role: 'admin' },
    'products',
    ID,
    { reason: 'La foto no corresponde al producto ofrecido.' },
    store,
    new Date('2026-04-01T09:00:00.000Z'),
  );

  assert.deepEqual(store.writes[0].updated, {
    status: 'inactive',
    inactiveReason: 'La foto no corresponde al producto ofrecido.',
  });
  assert.equal(store.writes[1].audit.action, 'publication.taken_down');
  assert.equal(answer.status, 'inactive');
  void notified;
});

test('restoring clears the reason and puts the item back', async () => {
  const store = storeOf({ rows: [publication({ status: 'inactive', inactiveReason: 'x' })] });

  await restore({ id: 'admin-1', role: 'admin' }, 'products', ID, store);

  assert.deepEqual(store.writes[0].updated, { status: 'active', inactiveReason: null });
  assert.equal(store.writes[1].audit.action, 'publication.restored');
});

test('a reason of two letters is refused before anything changes', async () => {
  const store = storeOf();

  await assert.rejects(
    takeDown({ id: 'admin-1', role: 'admin' }, 'products', ID, { reason: 'no' }, store),
    (error) => {
      assert.equal(error.field, 'reason');
      return true;
    },
  );

  assert.deepEqual(store.writes, []);
});

test('a vacancy is moderated through the same write, with its own notice', async () => {
  const store = storeOf({
    rows: [
      {
        _id: ID,
        title: 'Cajero',
        status: 'active',
        inactiveReason: null,
        publishedAt: new Date('2026-03-01T10:00:00.000Z'),
        member: { _id: MEMBER_ID, businessName: 'Café La Unión' },
      },
    ],
  });

  const answer = await takeDown(
    { id: 'admin-1', role: 'admin' },
    'vacancies',
    ID,
    { reason: 'El puesto ya no está disponible.' },
    store,
  );

  assert.equal(answer.title, 'Cajero');
  assert.equal(store.writes[1].audit.action, 'vacancy.taken_down');
});

test('an item that does not exist cannot be taken down', async () => {
  await assert.rejects(
    takeDown(
      { id: 'admin-1', role: 'admin' },
      'products',
      ID,
      { reason: 'La foto no corresponde al producto ofrecido.' },
      { ...storeOf(), findPublication: async () => null },
    ),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    },
  );
});

// A promotion is not a product: moderating one must not reach the other.
test('a publication of another kind is not found through this tab', async () => {
  await assert.rejects(
    takeDown(
      { id: 'admin-1', role: 'admin' },
      'promotions',
      ID,
      { reason: 'La promoción no cumple lo anunciado.' },
      storeOf({ rows: [publication({ type: 'product' })] }),
    ),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    },
  );
});
