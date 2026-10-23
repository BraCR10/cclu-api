const test = require('node:test');
const assert = require('node:assert/strict');
const publicationService = require('../../src/services/publicationService');

const MEMBER_ID = '64b7f0a1c2d3e4f5a6b7c8d9';
const PUBLICATION_ID = '64b7f0a1c2d3e4f5a6b7c8da';
const CATEGORY_ID = '64b7f0a1c2d3e4f5a6b7c8db';
const NOW = new Date('2026-10-23T15:00:00Z');

function stored(overrides = {}) {
  return {
    _id: PUBLICATION_ID,
    member: MEMBER_ID,
    type: 'product',
    title: 'Café molido 500 g',
    description: 'Tueste medio, molido para cafetera.',
    price: 5500,
    imageUrl: null,
    category: { _id: CATEGORY_ID, name: 'Cafeterías' },
    percentage: null,
    condition: null,
    startsAt: null,
    endsAt: null,
    status: 'active',
    inactiveReason: null,
    publishedAt: NOW,
    removedAt: null,
    ...overrides,
  };
}

function makeStore(rows = [stored()], plan = { entitlements: { publishInMarketplace: true } }) {
  const list = rows.slice();

  return {
    rows: list,
    list: async () => list,
    count: async () => list.length,
    find: async (memberId, publicationId) =>
      list.find((row) => row._id === publicationId && row.removedAt === null) ?? null,
    create: async (fields) => {
      const created = stored({ ...fields, _id: `created-${list.length}` });

      list.push(created);

      return created;
    },
    update: async (publicationId, update) => {
      const row = list.find((candidate) => candidate._id === publicationId);

      Object.assign(row, update.$set ?? {});

      return row;
    },
    remove: async (memberId, publicationId, now) => {
      const row = list.find((candidate) => candidate._id === publicationId);

      if (row === undefined) {
        return { matchedCount: 0 };
      }

      row.removedAt = now;

      return { matchedCount: 1 };
    },
    readPlan: async () => plan,
  };
}

test('a product asks for its price and a picture', async () => {
  const store = makeStore();

  await assert.rejects(
    publicationService.createPublication(
      MEMBER_ID,
      { type: 'product', title: 'Café', description: 'Molido' },
      NOW,
      store,
    ),
    (error) => error.code === 'required' && error.field === 'price',
  );

  await assert.rejects(
    publicationService.createPublication(
      MEMBER_ID,
      { type: 'product', title: 'Café', description: 'Molido', price: 5500 },
      NOW,
      store,
    ),
    (error) => error.code === 'required' && error.field === 'imageUrl',
  );
});

test('a product is published with its price and its picture', async () => {
  const store = makeStore();

  const created = await publicationService.createPublication(
    MEMBER_ID,
    {
      type: 'product',
      title: 'Café molido 500 g',
      description: 'Tueste medio.',
      price: 5500,
      imageUrl: 'https://cdn.example.cr/cafe.png',
    },
    NOW,
    store,
  );

  assert.equal(created.title, 'Café molido 500 g');
  assert.equal(created.price, 5500);
  assert.equal(created.status, 'active');
});

test('a promotion is published with the days it runs', async () => {
  const store = makeStore();

  const created = await publicationService.createPublication(
    MEMBER_ID,
    {
      type: 'promotion',
      title: 'Semana del café',
      description: 'Dos por uno en el grano de la casa.',
      startsAt: '2026-11-01',
      endsAt: '2026-11-07',
    },
    NOW,
    store,
  );

  assert.equal(created.startsAt, '2026-11-01');
  assert.equal(created.endsAt, '2026-11-07');
});

// A promotion ending before it starts is a typo, and the field that is wrong is
// the one the screen has to mark.
test('a validity that ends before it starts is refused on endsAt', async () => {
  const store = makeStore();

  await assert.rejects(
    publicationService.createPublication(
      MEMBER_ID,
      {
        type: 'promotion',
        title: 'Semana del café',
        description: 'Dos por uno.',
        startsAt: '2026-11-07',
        endsAt: '2026-11-01',
      },
      NOW,
      store,
    ),
    (error) => error.code === 'invalid_format' && error.field === 'endsAt',
  );
});

test('a discount asks for its percentage and its condition', async () => {
  const store = makeStore();

  await assert.rejects(
    publicationService.createPublication(
      MEMBER_ID,
      {
        type: 'discount',
        title: 'Agremiados',
        description: 'Descuento en el local.',
        startsAt: '2026-11-01',
        endsAt: '2026-12-01',
      },
      NOW,
      store,
    ),
    (error) => error.code === 'required' && error.field === 'percentage',
  );

  await assert.rejects(
    publicationService.createPublication(
      MEMBER_ID,
      {
        type: 'discount',
        title: 'Agremiados',
        description: 'Descuento en el local.',
        percentage: 120,
        condition: 'Con el carné al día',
        startsAt: '2026-11-01',
        endsAt: '2026-12-01',
      },
      NOW,
      store,
    ),
    (error) => error.code === 'invalid_format' && error.field === 'percentage',
  );
});

test('the list says whether the plan lets the member publish', async () => {
  const withPlan = await publicationService.listOwnPublications(
    MEMBER_ID,
    {},
    NOW,
    makeStore([stored()]),
  );
  const free = await publicationService.listOwnPublications(
    MEMBER_ID,
    {},
    NOW,
    makeStore([stored()], { entitlements: { publishInMarketplace: false } }),
  );

  assert.equal(withPlan.canPublish, true);
  assert.equal(free.canPublish, false);
  assert.equal(withPlan.items.length, 1);
});

test('an edit keeps the type of the publication', async () => {
  const store = makeStore();

  const updated = await publicationService.updatePublication(
    MEMBER_ID,
    PUBLICATION_ID,
    {
      title: 'Café molido 1 kg',
      description: 'Tueste medio.',
      price: 9900,
      imageUrl: 'https://cdn.example.cr/cafe.png',
    },
    store,
  );

  assert.equal(updated.type, 'product');
  assert.equal(updated.title, 'Café molido 1 kg');
});

test('a publication the chamber took down cannot be put back by the member', async () => {
  const store = makeStore([stored({ status: 'inactive', inactiveReason: 'Precio engañoso.' })]);

  await assert.rejects(
    publicationService.setPublicationStatus(MEMBER_ID, PUBLICATION_ID, { status: 'active' }, store),
    (error) => error.code === 'not_allowed' && error.field === 'status',
  );
});

test('the member takes one down and puts it back', async () => {
  const store = makeStore();

  const down = await publicationService.setPublicationStatus(
    MEMBER_ID,
    PUBLICATION_ID,
    { status: 'inactive' },
    store,
  );
  const up = await publicationService.setPublicationStatus(
    MEMBER_ID,
    PUBLICATION_ID,
    { status: 'active' },
    store,
  );

  assert.equal(down.status, 'inactive');
  assert.equal(up.status, 'active');
});

test('deleting a publication sets a date instead of erasing it', async () => {
  const store = makeStore();

  await publicationService.deleteOwnPublication(MEMBER_ID, PUBLICATION_ID, NOW, store);

  assert.notEqual(store.rows[0].removedAt, null);
});

test('a publication of somebody else is not found', async () => {
  const store = makeStore();

  await assert.rejects(
    publicationService.updatePublication(
      MEMBER_ID,
      '64b7f0a1c2d3e4f5a6b7c8ff',
      {
        title: 'Otra cosa',
        description: 'Nada.',
        price: 1,
        imageUrl: 'https://cdn.example.cr/x.png',
      },
      store,
    ),
    (error) => error.statusCode === 404,
  );
});
